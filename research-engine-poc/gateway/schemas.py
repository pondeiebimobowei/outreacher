from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

class ResearchCompanyContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    industry: Optional[str] = None

class ResearchCompanyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["1.0"]
    request_id: str = Field(..., min_length=1)
    research_run_id: str = Field(..., min_length=1)
    company_name: str = Field(..., min_length=1)
    website_url: Optional[str] = None
    domain: Optional[str] = None
    context: Optional[ResearchCompanyContext] = None
