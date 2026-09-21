import base64
import json
import os
import urllib.request

import ydb
import ydb.credentials

TABLE_PATH = os.environ["YDB_DATABASE"].rstrip("/") + "/bilety"

_POOL = None


def _get_sa_token() -> dict:
    url = ("http://169.254.169.254/computeMetadata/v1/instance/"
           "service-accounts/default/token")
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


class _IAMCredentials(ydb.credentials.AbstractExpiringTokenCredentials):
    def _make_token_request(self):
        return _get_sa_token()


def _pool():
    global _POOL
    if _POOL is None:
        driver = ydb.Driver(
            ydb.DriverConfig(
                os.environ["YDB_ENDPOINT"],
                os.environ["YDB_DATABASE"],
                credentials=_IAMCredentials(),
            )
        )
        driver.wait(timeout=10, fail_fast=True)
        _POOL = ydb.SessionPool(driver)
    return _POOL


def _select_ticket(ticket: int):
    def run(session):
        query = session.prepare(
            "DECLARE $ticket AS Int32; "
            "SELECT ticket_number, question_number, data, "
            "image IS NOT NULL AS has_image FROM `bilety` "
            "WHERE ticket_number = $ticket "
            "ORDER BY ticket_number, question_number;"
        )
        rs = session.transaction().execute(
            query, parameters={"$ticket": ticket}, commit_tx=True
        )
        return rs[0].rows
    return _pool().retry_operation_sync(run)


def _select_image(ticket: int, number: int):
    def run(session):
        query = session.prepare(
            "DECLARE $ticket AS Int32; "
            "DECLARE $number AS Int32; "
            "SELECT image FROM `bilety` "
            "WHERE ticket_number = $ticket AND question_number = $number;"
        )
        rs = session.transaction().execute(
            query,
            parameters={"$ticket": ticket, "$number": number},
            commit_tx=True,
        )
        return rs[0].rows
    return _pool().retry_operation_sync(run)


def _response(status, payload, content_type="application/json; charset=utf-8"):
    body = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": content_type,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": body,
        "isBase64Encoded": False,
    }


def _image_response(data: bytes):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "image/jpeg",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
        },
        "body": base64.b64encode(data).decode("ascii"),
        "isBase64Encoded": True,
    }


def _ticket_payload(ticket: int):
    rows = _select_ticket(ticket)
    if not rows:
        raise KeyError(f"Билет {ticket} не найден")
    questions = []
    for row in rows:
        questions.append(
            {
                "n": row["question_number"],
                "data": json.loads(row["data"]),
                "has_image": bool(row["has_image"]),
            }
        )
    return {"ok": True, "ticket": ticket, "questions": questions}


def _int_or_none(value, name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Параметр '{name}' должен быть целым числом")


def handler(event, context):
    try:
        method = (event.get("httpMethod") or event.get("method") or "GET").upper()
        if method == "OPTIONS":
            return _response(200, {"ok": True})
        if method != "GET":
            return _response(405, {"ok": False, "error": "Метод не поддерживается"})

        qsp = event.get("queryStringParameters") or {}

        if "image" in qsp:
            ticket = _int_or_none(qsp.get("ticket"), "ticket")
            number = _int_or_none(qsp.get("n"), "n")
            rows = _select_image(ticket, number)
            if not rows or rows[0].get("image") is None:
                return _response(404, {"ok": False, "error": "Картинка не найдена"})
            return _image_response(rows[0]["image"])

        if "ticket" in qsp:
            ticket = _int_or_none(qsp["ticket"], "ticket")
            return _response(200, _ticket_payload(ticket))

        return _response(200, {"ok": True, "tickets": 40})
    except KeyError as e:
        return _response(404, {"ok": False, "error": str(e)})
    except Exception as e:
        return _response(500, {"ok": False, "error": str(e)})