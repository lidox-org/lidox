from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.redis_client import close_redis
from app.routes.system import router as system_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await close_redis()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
        description=(
            "FastAPI migration scaffold for the Lidox Assignment 2 backend. "
            "This app is intentionally running in parallel with the existing "
            "NestJS implementation until endpoint parity is complete."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.cors_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {"message": "Lidox FastAPI migration scaffold"}

    app.include_router(system_router, prefix="/api")
    return app


app = create_app()

