"""OpenRMM Configuration"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "OpenRMM"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = os.environ.get("OPENRMM_DEBUG", "false").lower() == "true"
    
    # Database
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "openrmm"
    POSTGRES_USER: str = "openrmm"
    POSTGRES_PASSWORD: str = "openrmm_dev_2026"
    DATABASE_URL: str = ""
    
    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = ""
    
    # Auth
    SECRET_KEY: str = "openrmm_dev_secret_key_2026_change_me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    ALGORITHM: str = "HS256"
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "https://openrmm.derfwins.com",
        "http://openrmm.derfwins.com",
    ]
    
    # TURN server (WebRTC relay)
    TURN_SHARED_SECRET: str = "fXQa7DiO7_Fy-bCDmo5H6h_8giYaHlaT0hHKWcgD_7gHq_ZwOhAxVTrWnEzN68TP"
    TURN_HOST: str = "turn.openrmm.derfwins.com"

    # Agent
    LATEST_AGENT_VER: str = "0.1.0"
    AGENT_DOWNLOAD_URL: str = ""
    
    class Config:
        env_file = ".env"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.DATABASE_URL:
            self.DATABASE_URL = f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        if not self.REDIS_URL:
            self.REDIS_URL = f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"


settings = Settings()