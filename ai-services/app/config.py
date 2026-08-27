from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8000
    allowed_origins: str = "http://localhost:5000"
    gemini_api_key: str = ""
    # Pinned deliberately: the 'gemini-flash-latest' alias this used to point at
    # returns 503 "high demand" on every call for this key, which silently sent
    # every interview to the offline question bank.
    gemini_model: str = "gemini-3.5-flash"
    # Tried when the primary is unavailable, before giving up to the offline bank.
    gemini_fallback_model: str = "gemini-3.5-flash-lite"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
