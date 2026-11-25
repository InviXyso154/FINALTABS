# Calculation Sheet

## Relevance worked example

- Formula: `cos = (A.B)/(|A||B|)`
- Dot product: 4.974499
- Page norm: 7.440914
- Deck norm: 1.000000
- Cosine: 0.668533
- Label: related
- Thresholds: T_HI=0.15 (provisional), T_LO=0.05 (provisional)

### Term table

| Term | Page TF | IDF | Page weight | Deck weight | Contribution |
|---|---:|---:|---:|---:|---:|
| binary | 2 | 1.693147 | 3.386294 | 0.185036 | 0.626587 |
| traversal | 2 | 1.693147 | 3.386294 | 0.185036 | 0.626587 |
| tree | 2 | 1.693147 | 3.386294 | 0.185036 | 0.626587 |
| algorithm | 1 | 1.287682 | 1.287682 | 0.352705 | 0.454172 |
| data | 1 | 1.693147 | 1.693147 | 0.240512 | 0.407221 |
| structure | 1 | 1.693147 | 1.693147 | 0.240512 | 0.407221 |
| edge | 1 | 1.287682 | 1.287682 | 0.310515 | 0.399845 |
| first | 1 | 1.287682 | 1.287682 | 0.310515 | 0.399845 |
| search | 1 | 1.287682 | 1.287682 | 0.310515 | 0.399845 |
| depth | 1 | 1.693147 | 1.693147 | 0.185036 | 0.313294 |
| node | 1 | 1.693147 | 1.693147 | 0.185036 | 0.313294 |
| breadth | 0 | 1.693147 | 0.000000 | 0.223254 | 0.000000 |
| computer | 0 | 1.693147 | 0.000000 | 0.240512 | 0.000000 |
| graph | 0 | 1.693147 | 0.000000 | 0.223254 | 0.000000 |
| recursion | 0 | 1.693147 | 0.000000 | 0.185036 | 0.000000 |
| science | 0 | 1.693147 | 0.000000 | 0.240512 | 0.000000 |
| vertice | 0 | 1.693147 | 0.000000 | 0.223254 | 0.000000 |

### Substitution

`cos = 4.974499 / (7.440914 × 1.000000) = 0.668533`

## Scheduler worked example

- Exposure credit: 0.5
- Quality: 4
- Repetitions before review: 3
- Base interval before review: 10

| Step | Label | Formula | Inputs | Result |
|---|---|---|---|---|
| ease-factor-update | Ease-factor update | ease = max(1.3, easeBefore + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))) | {"easeBefore":2.5,"grade":4} | 2.5 |
| repetitions-base-interval | Repetitions and base interval | grade < 3: reps=0, base=1; reps=1: base=1; reps=2: base=6; reps>2: base=max(1, round(baseBefore*ease)) | {"grade":4,"repetitionsBefore":3,"baseBefore":10,"easeFactor":2.5} | {"repetitions":4,"baseInterval":25} |
| credit-clamp | Exposure credit clamp | credit = grade >= 3 ? clamp(exposureCredit, 0, CREDIT_CAP) : 0 | {"grade":4,"exposureCredit":0.5,"creditCap":1} | 0.5 |
| exposure-multiplier | Exposure multiplier | one-sided: clamp(1 + GAMMA*credit, 1, MAX_MULT) | {"credit":0.5,"gamma":0.2,"maxMult":1.25,"twoSided":false} | 1.1 |
| interval-before-cap | Interval before deadline cap | intervalBeforeCap = max(1, baseInterval * exposureMultiplier) | {"baseInterval":25,"exposureMultiplier":1.1} | 27.500000000000004 |
| deadline-cap | Deadline cap | deadlineCap = examDate ? max(1, (examDate-now)/(K_REVIEWS*86400000)) : null | {"examDate":1798934400000,"now":1798070400000,"kReviews":3} | 3.3333333333333335 |
| final-interval | Final interval | finalInterval = deadlineCap ? min(intervalBeforeCap, deadlineCap) : intervalBeforeCap | {"intervalBeforeCap":27.500000000000004,"deadlineCap":3.3333333333333335} | 3.3333333333333335 |

- Final interval: 3.333333 days

These numbers are generated directly from `explainRelevance` and `calculateReview`.
