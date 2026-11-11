from pydantic import BaseModel, Field


class RequirementsDraft(BaseModel):
    """What the requirement agent extracts from the conversation."""

    summary: str = Field(
        description="A short paragraph summarising the conversation: who the client is, what was discussed and what was agreed.",
    )
    intent: str = Field(
        description="One or two sentences on what the client wants built and why.",
    )
    functional_requirements: list[str] = Field(
        description="Each item is one concrete thing the system must do.",
    )
    user_stories: list[str] = Field(
        description="Each item follows 'As a <user>, I want <goal> so that <benefit>'.",
    )
