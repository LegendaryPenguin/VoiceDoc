# VoiceDoc

<img width="1393" height="712" alt="image" src="https://github.com/user-attachments/assets/8d0fa153-0a62-4049-90d6-f8e2d935e520" />


## Problem (what patients and clinicians face today)

**Not enough clinicians, longer waits:** The U.S. is on track for a shortage of up to 86,000 physicians by 2036 and a growing share of current doctors are nearing retirement age. New-patient appointment waits have climbed to 31 days on average across major metros (up 19% since 2022).

**High call volume + long calls:** Access is uneven, so people turn to virtual care and telehealth with nurse-led telehealth/triage lines that routinely handle large call volumes. However, these calls are not short. Surveys report that typical nurse triage calls run 11–16 minutes. In big systems, daily volume can spike from ~1,000 to 7,000 calls/day during peaks.

**Half the calls don’t become appointments:** Evidence shows that about 50% of primary-care call-center cases can be handled with self-care advice alone, meaning no visit is scheduled. This means that huge blocks of nurse time are used up with no booked visit.

**Paying is stressful and opaque:**  Americans carry at least $220 billion in medical debt; millions owe over $1,000 and many delay or avoid care because of costs. Clinics struggle with no-shows, rescheduling, and collecting balances.
Result: people wait too long, worry about the bill, and bounce between apps. Clinicians lose time and revenue to no-shows, refunds, and payment follow-up.

## Solution (what VoiceDoc is)
VoiceDoc is a voice-first telehealth experience that feels like booking a ride:
You talk to an AI assistant that listens, clarifies symptoms, and drafts a clean visit summary based on your synthesized vitals, medical history, and past lab results.
When you’re ready, you pre-authorize a capped amount for the visit: think “hold up to $50.”
After the visit, the clinician charges only what was used (say $35 with insurance copay) and the rest is instantly returned ($15).
If the clinician prefers traditional dollars, they can cash out to USD seamlessly.
Your Medical Passport (a privacy-preserving, portable record pointer) updates after each visit so future care picks up where you left off.

## The story (patient & clinic journey)

Lets imagine what a possible patient and clinic journey can look like with our patient Maya and doctor Alvarez.

### Maya (patient)
**Ask:** Maya opens VoiceDoc, taps the mic, and explains what’s wrong. The assistant summarizes in plain language and lists what a doctor will likely ask next. VoiceDoc will then prompt Maya to schedule an appointment.

**Pre-authorize:** With one tap, Maya pays a base appointment fee for the visit. She can pay with USD and Coinbase Onramp will convert it into USDC to be held in an Escrow account.

**Visit:** Instead of paperwork and payment hurdles, a clinician sees Maya immediately, reviews the concise summary, provides service and focuses on care not paperwork.

**Settle:** The visit costs less than the cap. Only the actual fee is captured and the remaining is returned instantly.

**Takeaway:** Maya gets a doctor-friendly summary and her Medical Passport updates with relevant medical record, prescription, or lab work updates so she won’t repeat her story.

### Dr. Alvarez (clinic)
**Before the visit:** The patient’s funds are secured for today’s appointment, so the doctor can start on time without chasing payment.

**After the visit:** The clinic captures exactly the agreed fee in one click from the escrow account without manual refunds or awkward billing calls.

**If needed:** The clinic can cash out to USD on their side without extra steps using Coinbase offramp.

**Records:** A time-stamped visit summary reduces charting overhead and supports quality follow-ups. This record is minted onto the Medical Passport in the VoiceDoc app.

## Why it matters (benefits)
**For patients**
Predictable cost (you see the cap first).
No surprise bills and instant refunds of unused funds.
Less friction: one place to talk, book, pay, and access your medical passport.

**For clinicians**
Fewer no-shows and faster starts because payment is secured before the visit.
Zero time on refunds and fewer back-office billing tasks.
Clear documentation handed to you, not typed from scratch.

**For payers & systems**
Cleaner authorization and settlement data in real time.
Lower leakage from abandoned payments and collections.
Better continuity as the Medical Passport reduces duplicate work.

## Why now
Access pressure is growing (physician shortage up to 86k; 31-day average waits). 
Virtual care is mainstream (persistent monthly and annual use), but the payment moment is still fractured.
Families are cost-sensitive (hundreds of billions in medical debt), so “only pay what was used” is the trust feature telehealth has been missing.


# Tech
## Tech Used

**App & UI:** Next.js (App Router), TypeScript, Tailwind, Web Speech API for mic input + live captions, simple stateful chat.

**Identity & Wallet:** Coinbase Embedded Wallet via @coinbase/cdp-hooks (reads evmAddress inside the client).

**Funding:** Coinbase Onramp (JWT-signed Session Token → one-click Buy USDC popup with prefilled asset/network/amount).

**Payments:** USDC Escrow smart contract (fund → charge → automatic refund of remainder).

**Interoperability:** Circle CCTP v2 Fast Transfers (move canonical USDC between Base ↔ Avalanche) plus a server finalize step.

**Automation/trust:** Chainlink Functions to generate a signed AI visit summary and gate an on-chain record update; (optional) Chainlink CCIP to mirror “escrow closed” to another chain.

## Coinbase (CDP) 
**A) Embedded Wallet**

The app boots into a connected state with an embedded Coinbase wallet. We read evmAddress from @coinbase/cdp-hooks on the client and key the session (transcripts, summaries, and funding actions) to that address. This works without extensions so that patients never leave the flow.
Why it benefited the project:
This eliminated wallet setup onboarding for first-time users without wallets allowing the web3 technology to fade into the background.
This wallet gave us a reliable method for payments for the appointment booking and medical service through the escrow account.
Notable details we solved:
The hook exposes evmAddress (not address). Once we normalized this, it fixed a false “Please connect wallet” path.

**B) Onramp to Buy USDC**

What we implemented:
We implemented a Buy USDC button which opens the Coinbase popup directly in the Buy experience with amount and currency pre-filled (e.g., “Buy $25 of USDC on Base”), and the user’s wallet pre-selected.
How it’s pieced together:
Server signs an ES256 JWT for POST -> We request a session token for a single asset/network (USDC on Base) -> sessionToken, defaultExperience=buy
The popup is triggered by a user click to avoid blockers.
Why it benefited the project:
Onramp allows non crypto native users to pay for USDC directly with their credit card/traditional web2 payment methods helping crypto fade into the background.
Notable details we solved:
404s resolved by correcting the endpoint to /onramp/v1/token.
401s resolved by switching from legacy aud/method/path claims to the current iss/sub/uri spec and letting jsonwebtoken handle ECDSA r|s formatting.
“Send” vs “Buy” UI fixed by forcing defaultExperience=buy and scoping the session to one asset + network.

**C) CDP Data**

What we implemented:
We created a lightweight wallet banner that confirms USDC balance post-purchase before we prompt to escrow by using CDP’s token balance read.
Why it benefited the project:
It allows us to have immediate feedback that funds arrived without a separate indexer needed.
It also removed user uncertainty about funds available before moving to payment.


**D) x402**

What we implemented:
We implemented a per-service fiat checkout payment as a revenue model for our service. Users would pay a small fee (like $1) for the telehealth consultation and the medical service providers would pay a SAAS fee. 
Why it benefited the project:
This made collecting service payments from the user and medical provider easier by allowing for instant fiat payment that runs in parallel with the escrow model. widening adoption.


**E) Offramp to sell USDC**

What we implemented:
**Note, this feature is not 100% implemented due to time constraints**
We implemented an offramp USDC feature which is useful for payments made to the medical provider from the Escrow account. Medical providers that don’t want USDC payments can offramp 
Why it benefited the project:
Offramp allows non crypto native medical providers to receive USDC payments from the escrow account directly as USD by offramping the USDC

## Chainlink

**A) Chainlink Functions to gate medical record updates**

What we implemented:
Our telehealth voice agent conversation’s AI summary isn’t just “a string from a server.” We run it through Chainlink Functions and then write the visit pointer to the patient’s Medical Passport (a compact, privacy-preserving record index).
Flow:
The app triggers a Functions job with the visit context.
The job returns a signed result.
Our contract method accepts the result, verifies it, and appends a record pointer (URI + hash).
A “VisitRecorded” event emits for dashboards.

Why it benefited the project:
This was super beneficial because it created a verifiable audit trail as a provable off-chain compute step precedes a sensitive on-chain write. Each record stores a hash + URI and emits VisitRecorded. Anyone can verify the hash against the clinician-facing PDF/JSON we show. If a dispute arises (“that’s not what was agreed”), the ledger has an immutable timestamp and content fingerprint.

**B) Chainlink Function for AI**

What we implemented:
When a user taps the mic and asks a question, we (1) transcribe their speech, (2) get a live answer from the AI, and (3) speak it back through text to speech. This action is routed through Chainlink.
Flow:
The user taps the mic. We start recording and show live captions so they can see what the system heard.
We display interim words as they’re decoded and then lock them into the transcript once they’re final. If the user pauses, we auto-stop and submit the question.
We build a compact prompt using the chat context, and medical passport after removing all Identifiers. Only what is needed to answer the question is sent.
We request a streaming completion. As tokens arrive, we buffer short phrases.
We convert each small phrase (≈1–2 sentences) to audio and start playback as soon as the first 200–300 ms of audio is ready. While the first chunk is speaking, the next chunks are already synthesizing in the background.
If the user talks mid-answer, we pause playback and cancel the remaining synthesis to give the user control of the mic again. A single tap resumes or restarts the reply.
The same text we speak is also rendered as captions/bubbles. Users can copy it or tap replay to hear that segment again.
We append the final text response to the visit transcript (client-side). If the answer contributes to the visit note, it’s flagged for summarization later.
Why it benefited the project:
Health related conversations are extremely sensitive and are protected by HIPAA regulations. Chainlink verifies the step before we write a hash + URL with no PHI on-chain. This means the full summary lives off-chain and encrypted. We can also prevent AI providers like OpenAI from storing prompts/outputs by running inference behind a private endpoint which only sends the minimum redacted payload which increases user privacy greatly.

## Circle

**A) CCTP v2 Fast Transfers (Base ↔ Avalanche)**

What we implemented:
We realized that we would have a huge problem if the user has USDC funds on Base but the payment is being sent to a clinic that settles somewhere else. For this, we initiate a burn on the source chain and finalize the mint on the destination. A small server endpoint watches and finalizes this transaction to verify that the expected recipient is the escrow to prevent misroutes.
Why it benefited the project:
The patient can fund and pay the fee on a popular, low-fee chain and doesn’t have to worry about the clinic’s preferred chain. This is necessary for cross chain interoperability which Circle helps us achieve!

**B) Paymaster (prototype)**

Implementation:
This implementation would include a guarded toggle that allows the patient’s first actions to pay gas in USDC instead of needing native gas when on a supported network like Bases.
How this meets Circle track goals:
Multichain USDC Payment System: functional app + diagram; funds move via CCTP v2 into escrow and settle correctly.
Hooks readiness: our finalize/recipient checks are in place; we can add hook handlers to enforce policy server-side before completing a mint.
Pay for gas in USDC: a working prototype aligned to the Paymaster track that meaningfully improves first-time UX.

