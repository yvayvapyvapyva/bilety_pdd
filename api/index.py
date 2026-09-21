import base64
import json
import os
import urllib.request

import ydb
import ydb.credentials

TABLE_PATH = os.environ["YDB_DATABASE"].rstrip("/") + "/bilety"

_POOL = None
_MIGRATED = False


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


def _ensure_comment():
    global _MIGRATED
    if _MIGRATED:
        return

    def run(session):
        desc = session.describe_table(TABLE_PATH)
        cols = {c.name for c in getattr(desc, "columns", [])}
        if "comment" not in cols:
            session.execute_scheme(f"ALTER TABLE `{TABLE_PATH}` ADD COLUMN comment Utf8;")

    _pool().retry_operation_sync(run)
    _MIGRATED = True


def _select_ticket(ticket: int):
    def run(session):
        query = session.prepare(
            "DECLARE $ticket AS Int32; "
            "SELECT ticket_number, question_number, data, image, comment FROM `bilety` "
            "WHERE ticket_number = $ticket "
            "ORDER BY ticket_number, question_number;"
        )
        rs = session.transaction().execute(
            query, parameters={"$ticket": ticket}, commit_tx=True
        )
        return rs[0].rows
    return _pool().retry_operation_sync(run)


def _update_comment(ticket: int, number: int, comment):
    def run(session):
        query = session.prepare(
            "DECLARE $ticket AS Int32; "
            "DECLARE $number AS Int32; "
            "DECLARE $comment AS Utf8; "
            "UPDATE `bilety` SET comment = $comment "
            "WHERE ticket_number = $ticket AND question_number = $number;"
        )
        session.transaction().execute(
            query,
            parameters={"$ticket": ticket, "$number": number, "$comment": comment},
            commit_tx=True,
        )
    _pool().retry_operation_sync(run)


def _stats():
    def run(session):
        query = session.prepare(
            "SELECT ticket_number, "
            "SUM(IF(comment IS NOT NULL AND comment != '', 1, 0)) AS comments "
            "FROM `bilety` GROUP BY ticket_number ORDER BY ticket_number;"
        )
        rs = session.transaction().execute(query, commit_tx=True)
        return rs[0].rows
    return _pool().retry_operation_sync(run)


def _response(status, payload, content_type="application/json; charset=utf-8"):
    body = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": content_type,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": body,
        "isBase64Encoded": False,
    }


def _ticket_payload(ticket: int):
    rows = _select_ticket(ticket)
    if not rows:
        raise KeyError(f"Билет {ticket} не найден")
    questions = []
    for row in rows:
        img = row.get("image")
        cm = row.get("comment")
        questions.append(
            {
                "n": row["question_number"],
                "data": json.loads(row["data"]),
                "image": base64.b64encode(img).decode("ascii") if img else None,
                "comment": cm or None,
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
        _ensure_comment()
        method = (event.get("httpMethod") or event.get("method") or "GET").upper()
        if method == "OPTIONS":
            return _response(200, {"ok": True})

        body = event.get("body")
        if not isinstance(body, dict):
            if isinstance(body, str):
                try:
                    body = json.loads(body) if body else {}
                except (ValueError, TypeError):
                    body = {}
            else:
                body = {}

        if method == "POST":
            ticket = _int_or_none(body.get("ticket"), "ticket")
            number = _int_or_none(body.get("n"), "n")
            comment = body.get("comment")
            if comment is None:
                raise ValueError("Поле 'comment' обязательно")
            _update_comment(ticket, number, str(comment))
            return _response(200, {"ok": True, "ticket": ticket, "n": number, "comment": comment})

        if method != "GET":
            return _response(405, {"ok": False, "error": "Метод не поддерживается"})

        qsp = event.get("queryStringParameters") or {}

        if "ticket" in qsp:
            ticket = _int_or_none(qsp["ticket"], "ticket")
            return _response(200, _ticket_payload(ticket))

        stats = [
            {"ticket": int(r["ticket_number"]), "comments": int(r["comments"])}
            for r in _stats()
        ]
        return _response(200, {"ok": True, "tickets": len(stats), "stats": stats})
    except KeyError as e:
        return _response(404, {"ok": False, "error": str(e)})
    except Exception as e:
        return _response(500, {"ok": False, "error": str(e)})