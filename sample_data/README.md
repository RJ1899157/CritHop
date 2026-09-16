# CritHop BYOC Sample Data & Multi-Hop Test Suites

This directory contains curated multi-hop documents designed specifically for testing **CritHop Bring Your Own Corpus (BYOC)** mode.
Each scenario contains 4-5 interconnected evidence passages and 2 distractor passages to rigorously test:
1. **Hybrid Retrieval (BM25 + BGE Dense)**: Locating entry seed passages.
2. **PassageGraph Construction**: Cosine similarity thresholding connecting related cross-document passages.
3. **Hop-by-Hop Traversal**: Guided entity and property bridge exploration.
4. **SLM IsREL Critique**: Neural pruning of irrelevant distractors.
5. **Self-RAG IsSUP & IsUSE**: Verification of supporting facts and grounded answering.

---

## Scenario 1: Cyber Threat Intelligence & S3 Exfiltration
- **Files**: `01_cyber_threat_apt29.txt`, `01_cyber_threat_apt29.json`
- **Domain**: Cloud Incident Response, Threat Attribution, AWS CloudTrail
- **Question**: *"Which threat group is responsible for creating the unauthorized S3 presigned URL on the fintech-core-vault-us-east bucket?"*
- **Reasoning Chain**:
  - **Hop 1**: S3 presigned URL on `fintech-core-vault-us-east` was created by IAM role `arn:aws:iam::123456789012:role/ProdDataSync`.
  - **Hop 2**: `ProdDataSync` IAM credentials were stolen via post-install script in `@auth-tools/jwt-verify` and exfiltrated to IP `198.51.100.44`.
  - **Hop 3**: Threat intel report TI-884 attributes IP `198.51.100.44` to threat actor **Cobalt Viper**.
- **Expected Answer**: **Cobalt Viper** (or UNC-3921).

---

## Scenario 2: Corporate Travel Policy & Expense Compliance
- **Files**: `02_corporate_travel_policy.md`, `02_corporate_travel_policy.json`
- **Domain**: Enterprise Policy Compliance, HR & Finance Auditing
- **Question**: *"Was Sarah Chen's Business Class flight compliant with corporate travel policy, and is her claimed dinner expense eligible for full reimbursement?"*
- **Reasoning Chain**:
  - **Hop 1**: Section 4.1 requires >8 hours for Business Class, but Section 4.3 waives this to 6 hours if an Executive Briefing is scheduled within 4 hours of arrival.
  - **Hop 2**: Sarah's flight was 7h 45m and her Barclays briefing occurred 2.5 hours after landing, making her Business Class flight **compliant**.
  - **Hop 3**: Section 7.2 caps daily meals in London at $120 and strictly excludes alcohol for solo meals. Her $140 meal includes $45 wine, so it is **not fully reimbursable** (she is owed $95 only).
- **Expected Answer**: **Her Business Class flight was compliant under the Section 4.3 Executive Briefing exception, but her dinner is not eligible for full reimbursement because it exceeds the $120 London per diem limit and includes non-reimbursable alcohol on a solo meal.**

---

## Scenario 3: Oncology Drug-Drug Interaction & Dose Adjustment
- **Files**: `03_oncology_drug_interaction.md`, `03_oncology_drug_interaction.json`
- **Domain**: Clinical Oncology, Pharmacokinetics, CYP3A4 Inhibition
- **Question**: *"What immediate oncologic dose adjustment and cardiac monitoring protocol should be ordered for Patient #9482 following her new prescription?"*
- **Reasoning Chain**:
  - **Hop 1**: Patient #9482 is stabilized on Osimertinib 80mg and was prescribed Clarithromycin for atypical pneumonia.
  - **Hop 2**: Clarithromycin is a strong CYP3A4 inhibitor that increases Osimertinib exposure by 1.8-fold, creating high risk for QTc prolongation and fatal arrhythmias.
  - **Hop 3**: Oncology Guideline Section 12 dictates that when co-administered with strong CYP3A4 inhibitors, Osimertinib must be reduced from 80mg to 40mg daily, with mandatory weekly 12-lead ECG telemetry.
- **Expected Answer**: **Reduce Osimertinib dosage from 80 mg to 40 mg once daily and institute mandatory weekly 12-lead ECG monitoring for QTc prolongation.**

---

## Scenario 4: Renaissance Art Provenance & Postwar Restitution
- **Files**: `04_renaissance_art_provenance.txt`, `04_renaissance_art_provenance.json`
- **Domain**: Cultural Property Restitution, Historical Archival Provenance
- **Question**: *"Where is the Botticelli workshop painting purchased by Baron Viktor von Wertheim in 1924 currently located, and under what catalog ID is it held?"*
- **Reasoning Chain**:
  - **Hop 1**: 1924 Christie's Lot 44 purchased by Baron Viktor von Wertheim was seized by the Gestapo in Vienna in 1938 under Reich code `MK-482`.
  - **Hop 2**: Postwar Altaussee salt mine recovery report documents crate `MK-482` was mislabeled as the Count Potocki collection and repatriated to Warsaw in 1948.
  - **Hop 3**: National Museum in Warsaw 1951 accession ledger records this panel under Entry #W-1049, exhibited as 'Youth with Laurel'.
- **Expected Answer**: **National Museum in Warsaw, held under Accession Entry #W-1049 (exhibited as 'Youth with Laurel').**
