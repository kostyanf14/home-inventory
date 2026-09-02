from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.rate_limit import auth_limiter
from app.db.session import Base, enable_sqlite_foreign_keys, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
enable_sqlite_foreign_keys(test_engine)
TestingSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """The auth limiter is process-wide; each test starts with an empty window."""
    auth_limiter.reset()
    yield
    auth_limiter.reset()


@pytest_asyncio.fixture(scope="function")
async def db() -> AsyncGenerator[AsyncSession]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestingSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def login(client: AsyncClient):
    """Register a user (ignoring an existing account) and return their token pair."""

    async def _login(
        email: str = "user@example.com", password: str = "password123"
    ) -> dict[str, str]:
        await client.post("/api/v1/auth/register", json={"email": email, "password": password})
        response = await client.post(
            "/api/v1/auth/login", data={"username": email, "password": password}
        )
        assert response.status_code == 200, response.text
        return response.json()

    return _login


@pytest.fixture
def headers(login):
    """Authorization header for a freshly registered user."""

    async def _headers(
        email: str = "user@example.com", password: str = "password123"
    ) -> dict[str, str]:
        tokens = await login(email, password)
        return {"Authorization": f"Bearer {tokens['access_token']}"}

    return _headers
