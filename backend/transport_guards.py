"""Phase H — H25: Transport guards (ASGI middleware).

Rejects:
  * `Content-Length` + `Transfer-Encoding` in same request (HTTP smuggling).
  * Request body not valid UTF-8 when declared JSON.

Adds `X-Accel-Buffering: no` to SSE responses (in agent_routes).
HTTP/2 rapid-reset cap is enforced by the ASGI server (uvicorn 0.34 — built-in)
when `--http h11` is not forced.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.requests import Request


class TransportGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        te = request.headers.get("transfer-encoding")
        if cl and te:
            return JSONResponse(
                status_code=400,
                content={"error": "HTTP request smuggling: Content-Length + Transfer-Encoding both present"},
            )

        ct = request.headers.get("content-type", "").lower()
        if "application/json" in ct and request.method in ("POST", "PUT", "PATCH"):
            body = await request.body()
            if body:
                try:
                    body.decode("utf-8", errors="strict")
                except UnicodeDecodeError:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "body is not valid UTF-8"},
                    )

                async def _replay():
                    return {"type": "http.request", "body": body, "more_body": False}

                request._receive = _replay  # noqa: SLF001 — replay single-read body

        return await call_next(request)
