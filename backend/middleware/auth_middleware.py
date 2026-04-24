"""Phase H — H27: Unified auth middleware.

Single code path for every authenticated request. Supplements per-route
Depends(get_current_user) by populating request.state.user on ingress.

Public paths (auth login, OAuth callback, Stripe webhook, health, docs):
skip auth. Legacy paths: 410 Gone.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from auth import get_current_user
from fastapi.security import HTTPAuthorizationCredentials


_PUBLIC_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/otp",
    "/api/v1/auth/oauth",
    "/api/v1/auth/google",
    "/api/v1/auth/github",
    "/api/v1/billing/webhook",
    "/api/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)
_LEGACY_PREFIXES = (
    "/api/v1/auth/legacy-",
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in _LEGACY_PREFIXES):
            return JSONResponse(status_code=410, content={"error": "endpoint deprecated"})
        if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
            return await call_next(request)
        auth_hdr = request.headers.get("authorization", "")
        if not auth_hdr.lower().startswith("bearer "):
            return JSONResponse(status_code=401, content={"error": "missing bearer token"})
        token = auth_hdr.split(" ", 1)[1]
        try:
            user = get_current_user(
                HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
            )
        except Exception:
            return JSONResponse(status_code=401, content={"error": "invalid token"})
        request.state.user = user
        return await call_next(request)
