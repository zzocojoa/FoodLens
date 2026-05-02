# FoodLens AI model cost comparison

Last checked: 2026-05-02

Official pricing sources:

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- OpenAI image input tokenization: https://developers.openai.com/api/docs/guides/images-vision
- Google Agent Platform / Vertex Gemini pricing: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing

Pricing must stay outside application code. Treat the numbers below as an ops decision snapshot, not constants to hardcode.

## 1. Current Gemini 2.5 Pro billing path

The main Gemini 2.5 Pro charge source is label analysis.

- `backend/modules/analyst_runtime/food_analyst.py:120` sets food and barcode allergen model from `GEMINI_MODEL_NAME`, defaulting to `gemini-2.0-flash`.
- `backend/modules/analyst_runtime/food_analyst.py:121` sets label model from `GEMINI_LABEL_MODEL_NAME`, defaulting to `gemini-2.5-pro`.
- `backend/modules/analyst_runtime/food_analyst.py:391` to `401` sends the label OCR extract pass with `self.label_model_name`.
- `backend/modules/analyst_runtime/food_analyst.py:416` to `432` sends a second label allergen assess pass with the same model when ingredients exist and assessment is enabled.
- `backend/server.py:4357` to `4509` wires `/analyze/label` to `analyst.analyze_label_json`.
- `backend/modules/analyst_runtime/router.py:90` to `95` routes `/analyze/smart` nutrition-label images into the same label path.
- `backend/modules/analysis_jobs.py` routes async `label` and `smart` jobs through the same analyst runtime.

Other possible Pro paths are configuration-dependent:

- `/analyze` uses `GEMINI_MODEL_NAME`; it only bills Gemini 2.5 Pro if the environment sets `GEMINI_MODEL_NAME=gemini-2.5-pro`.
- `/lookup/barcode` only calls Gemini when product ingredients exist and `allergy_info` is not `None`; it uses `GEMINI_MODEL_NAME`, not `GEMINI_LABEL_MODEL_NAME`.
- `/analyze/smart` first classifies with hard-coded `gemini-2.0-flash`, then can bill Pro only after routing to label.

Retry and output-cost risks:

- Food analysis sets `max_output_tokens=4096` and can retry once at `8192` on max-token finish (`backend/modules/analyst_runtime/food_analyst.py:270` to `295`).
- Label extract, label assess, and barcode allergen calls currently have no explicit `max_output_tokens`.
- Food retry/fallback is bounded by `GEMINI_RETRY_MAX_ATTEMPTS`; label 429 retry is hard-coded at max 3 attempts at the call sites.
- The code does not set Gemini thinking parameters. Google prices text output as response plus reasoning, so any future thinking output must be counted as output.
- OpenAI reasoning tokens should also be treated as output-token budget because API pricing charges model output tokens.

## 2. Model price comparison

Prices are USD per 1M tokens, Standard tier unless noted. For FoodLens request estimates, use short-context prices unless a prompt exceeds the provider's short-context threshold.

| Model | Input | Cached input | Output / reasoning | Image input handling | Cost note |
| --- | ---: | ---: | ---: | --- | --- |
| Gemini 2.5 Pro | $1.25 <=200K, $2.50 >200K | $0.13 <=200K, $0.25 >200K | $10 <=200K, $15 >200K | Text, image, video, audio priced as input tokens | Strong fallback model, too expensive as default 2-pass OCR. |
| Gemini 2.5 Flash | $0.30 | $0.03 | $2.50 | Text, image, video input | Best Gemini default candidate for OCR/food if quality passes. |
| Gemini 2.5 Flash Lite | $0.10 | $0.01 | $0.40 | Text, image, video input | Best cost candidate for router and barcode text; needs recall eval for allergen risk. |
| GPT-5.4 | $2.50 short, $5.00 long | $0.25 short, $0.50 long | $15 short, $22.50 long | Image inputs are billed as input tokens | High-quality candidate, not cost-effective as default. |
| GPT-5.4 mini | $0.75 | $0.075 | $4.50 | Patch-based image tokenization, multiplier 1.62 | Reasonable cross-provider OCR/food candidate after golden eval. |
| GPT-5.4 nano | $0.20 | $0.02 | $1.25 | Patch-based image tokenization, multiplier 2.46 | Router and text allergen candidate; label OCR only if recall holds. |

OpenAI image note: image inputs are charged as token inputs. For GPT-5.4 mini and nano, the official image guide uses 32px x 32px patch counting, capped by the model patch budget, then applies the model multiplier.

Google note: Gemini 2.5 prices list text output as response and reasoning. Pro output is 4x Gemini 2.5 Flash output and 25x Gemini 2.5 Flash Lite output at short context.

## 3. Route-level recommendation

| Route | Current behavior | Recommended default | Fallback |
| --- | --- | --- | --- |
| `/analyze` food image | `GEMINI_MODEL_NAME`, default `gemini-2.0-flash` | Gemini 2.5 Flash or GPT-5.4 mini A/B candidate | Gemini 2.5 Pro only for low-confidence or safety-critical failures. |
| `/analyze/label` OCR + allergen assess | `GEMINI_LABEL_MODEL_NAME`, default `gemini-2.5-pro`, 1 or 2 calls | Split extract and assess models: extract on Gemini 2.5 Flash or GPT-5.4 mini, assess on Gemini 2.5 Flash Lite or GPT-5.4 nano | Pro only after parse failure, low OCR confidence, or allergen ambiguity. |
| `/analyze/smart` router | Hard-coded `gemini-2.0-flash` classifier, then routes to food/label | Gemini 2.5 Flash Lite or GPT-5.4 nano classifier | Route to manual choice or existing Flash classifier, not Pro. |
| `/lookup/barcode` allergen text | Calls `GEMINI_MODEL_NAME` only when ingredients and allergies exist | Gemini 2.5 Flash Lite or GPT-5.4 nano | Gemini 2.5 Flash for ambiguous ingredient language; Pro generally disabled. |

## 4. Cost-reduction priorities

1. Change label default policy from implicit Pro to explicit env-controlled model selection. Do not let missing `GEMINI_LABEL_MODEL_NAME` silently choose `gemini-2.5-pro` in production.
2. Split label OCR extract and allergen assess into separate model keys. The second pass is text-only and should not reuse Pro by default.
3. Add `max_output_tokens` for label extract, label assess, and barcode allergen analysis.
4. Move cost accounting to the generation boundary so every Gemini/OpenAI attempt records route, model, provider, token usage, retry count, fallback count, and chargeable status.
5. Persist monthly cost usage in Postgres or Redis. The current in-memory guardrail resets on process restart and is not shared across instances.
6. Cache barcode allergen assessment by normalized ingredient list, normalized allergy profile, locale, and prompt version.
7. Keep Pro fallback opt-in and low-percentage until golden eval proves the cheaper path is safe.

## 5. A/B test design

Minimum golden set before switching defaults:

- 30 real food images covering cooked meals, mixed dishes, packaged food, sauces, desserts, and low-light images.
- 50 real label images covering Korean, English, Japanese, nutrition table only, ingredients only, glare, skew, small text, and folded packaging.
- 50 barcode ingredient text samples with known allergy outcomes.
- 20 smart-router images across food, label, barcode, menu, and not-food.

Metrics:

- Success rate: HTTP 2xx and non-fallback response.
- JSON parse rate: valid schema without repair.
- Allergen recall: true allergen detected / known allergen count. This is the primary safety metric.
- Allergen false positive rate: safe ingredient flagged as allergen.
- OCR ingredient recall: extracted known ingredient count / golden ingredient count.
- Latency: p50, p95, and p99 by route and model.
- Request cost: input tokens, cached input tokens, output tokens, reasoning/thinking tokens, retry attempts, and final estimated USD.
- Degradation: fallback rate, retry rate, and max-output retry rate.

Experiment cells:

- Current baseline: Gemini 2.5 Pro for label.
- Candidate A: Gemini 2.5 Flash extract + Gemini 2.5 Flash Lite assess.
- Candidate B: GPT-5.4 mini extract + GPT-5.4 nano assess.
- Candidate C: Gemini 2.5 Flash extract + GPT-5.4 nano assess.

Promotion gates:

- JSON parse rate >= 99%.
- Allergen recall >= baseline and no critical allergen false negatives.
- p95 latency <= baseline.
- Estimated request cost <= 35% of baseline for label.
- Golden image diff approved before any production rollout.

## 6. Feature-flag rollout plan

Current useful flags:

- `GEMINI_MODEL_NAME`
- `GEMINI_LABEL_MODEL_NAME`
- `LABEL_COST_GUARDRAIL_ENABLED`
- `LABEL_MONTHLY_BUDGET_USD`
- `LABEL_ESTIMATED_COST_USD_PER_REQUEST`
- `LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE`
- `LABEL_ROLLOUT_ENABLED`
- `LABEL_ROLLOUT_PERCENTAGE`
- `LABEL_ROLLOUT_STAGE`
- `LABEL_ROLLOUT_AUTO_ENABLED`

Recommended new flags:

- `AI_PROVIDER_ANALYZE`
- `AI_PROVIDER_LABEL_EXTRACT`
- `AI_PROVIDER_LABEL_ASSESS`
- `AI_PROVIDER_SMART_ROUTER`
- `AI_PROVIDER_BARCODE_ALLERGEN`
- `AI_MODEL_ANALYZE`
- `AI_MODEL_LABEL_EXTRACT`
- `AI_MODEL_LABEL_ASSESS`
- `AI_MODEL_SMART_ROUTER`
- `AI_MODEL_BARCODE_ALLERGEN`
- `AI_PRO_FALLBACK_ENABLED`
- `AI_PRO_FALLBACK_PERCENTAGE`
- `AI_COST_PRICE_CATALOG_VERSION`
- `AI_COST_GUARDRAIL_MODE`

Rollout sequence:

1. Shadow eval only: run candidates on golden sets outside production response path.
2. Internal traffic: 1% label extract only, assess still baseline.
3. 5% full label candidate with Pro fallback enabled.
4. 25% after KPI pass for parse, recall, latency, and cost.
5. 50% and 100% only after one full billing period or enough production volume to validate cost and recall.
6. Keep kill switch to force all routes back to existing Gemini defaults.

## 7. Pro fallback-only conditions

Pro should be disabled as a normal path and enabled only when all conditions are true:

- `AI_PRO_FALLBACK_ENABLED=1`.
- Request passes image quality gate.
- Cheaper model fails schema parsing after one bounded repair retry, or returns low-confidence OCR on safety-critical fields.
- Allergen assess finds ambiguous risk for user's registered allergens.
- The request has not exceeded per-user, per-route, and monthly budget guardrails.
- The fallback path has explicit `max_output_tokens` and records provider, model, route, attempt, and usage metadata.

Pro should not be used for routine smart routing or barcode allergen text unless a measured golden set shows cheaper models miss critical allergens.

## 8. Monthly $10 guardrail redesign

Current label guardrail uses `LABEL_MONTHLY_BUDGET_USD=10.0` and an estimated `LABEL_ESTIMATED_COST_USD_PER_REQUEST=0.02`. That means about 500 full-price label requests per month, with warn around 350, degrade around 425, and fallback around 500. The risk is that this is estimate-based, label-only, and in-memory.

Recommended guardrail:

- Store a price catalog outside code with official source URL, checked date, model, provider, input price, cached input price, output price, and reasoning/thinking policy.
- Estimate before calling the model using route, image token estimate, prompt token estimate, requested max output, retry budget, and fallback allowance.
- Record actual usage after response using provider usage metadata whenever available.
- Apply one shared monthly budget across `/analyze`, `/analyze/label`, `/analyze/smart`, async jobs, and `/lookup/barcode`.
- Split monthly budget by route, for example label 60%, food 25%, barcode 10%, smart router 5%, then allow ops to override allocations by env.
- Use hard request caps derived from the formula:

```text
max_requests_for_route = floor((monthly_budget_usd * route_budget_ratio) / estimated_cost_usd_per_request_p95)
```

- For a $10 budget, do not choose a static per-request threshold. Recompute it from current official prices and measured p95 token usage.
- Degrade order: disable label assess pass, switch assess to text-only cheap model, require manual retake for poor images, then fallback without model call.

## Immediate patch recommendation

Implement provider/model split for label first:

1. Keep existing Gemini path.
2. Add separate env keys for label extract and label assess models.
3. Set production defaults explicitly in Render instead of relying on code fallback.
4. Add `max_output_tokens` to both label passes.
5. Run the golden label set before changing production traffic.

This targets the known Pro cost path while keeping `/analyze`, `/lookup/barcode`, and mobile behavior stable.
