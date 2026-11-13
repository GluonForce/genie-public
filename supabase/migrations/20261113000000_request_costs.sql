-- Cost breakdown per prototype: what turning the recording into requirements cost, next to
-- build_cost_usd. Each is a total in USD from OpenRouter's reported cost.

alter table prototypes
  add column transcription_cost_usd numeric(10, 4) not null default 0,  -- speech to text, every Generate
  add column requirements_cost_usd  numeric(10, 4) not null default 0;  -- requirement agent, Generate and change requests
