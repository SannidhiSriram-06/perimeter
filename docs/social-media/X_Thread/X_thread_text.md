# X thread: Perimeter update (signal compressor + first live run)

Post as a thread from @Sriram_san. Attach the image named in each tweet.

## 1/6  (attach X_tweet1_live-incident-draft.png)
the signal compressor is done, and the whole pipeline just ran live for the first time

alert in → bank-network out as the root cause (correct)

then our own fact-checker flagged 1 of the model's 9 claims. it cited a metric for a latency claim 👇

## 2/6  (attach X_tweet2_pipeline-end-to-end.png)
full path now: alert → webhook → BFS blast radius → compressor → LLM draft → fact-checker → postgres → team-scoped API

the compressor scores each span/log/metric by how abnormal it is (70%) + how close it is to the alerting service (30%), then fills a 3k token budget best-first

## 3/6  (attach X_tweet3_claim-text-fix.png)
also found a hole in our own checker 🫠

a claim could get a green tick next to a sentence that said something false. the tick checked the fields, the sentence was the model's own words

fix: the sentence is now generated from the verified fields. a tick means what it says

## 4/6  (no image)
the live run found 2 bugs no unit test did:

• mock timestamps were frozen in the past, so every timestamp claim got flagged
• groq rejected a draft with a null time in the timeline (400)

fixed both. 177 engine tests, 45 api tests against a real postgres

## 5/6  (attach X_tweet5_role-scoping.png)
and a team only sees its own incidents

admin 14, payments member 11, platform member 3. wrong team gets 403, no token gets 401 👇

## 6/6  (no image)
honest status: still synthetic traces, and the benchmark is a dry run, not real fault injection yet. router + telegram bot are next

how would you want unsupported AI claims shown: flagged in red, or removed completely?
