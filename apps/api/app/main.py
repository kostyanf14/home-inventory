from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.endpoints import auth, barcode, inventory_items, places, sites
from app.core.config import settings
from app.db.session import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Automatically create tables for SQLite/dev environment
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(sites.router, prefix=settings.API_V1_STR)
app.include_router(places.router, prefix=settings.API_V1_STR)
app.include_router(inventory_items.router, prefix=settings.API_V1_STR)
app.include_router(barcode.router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {"message": "Welcome to Home Inventory API", "docs": "/docs"}
