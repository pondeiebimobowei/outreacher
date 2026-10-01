import json, hashlib
from pathlib import Path

OUT = Path(__file__).parent / "identity_v1_3_2_adversarial_suite.json"

# Sources are public first-party or statutory pages selected independently.
# The excerpts below are concise supporting excerpts/notes, not resolver-derived data.
pairs = {
    "Crown": [
        ("Crown Equipment Corporation", "https://www.crown.com/en-us/about-us.html",
         "Our Company — Crown Equipment is a leader in the evolution of the material handling industry."),
        ("Crown Resorts", "https://www.crownresorts.com.au/about-us",
         "Crown Resorts is one of Australia’s largest entertainment groups.")
    ],
    "Summit": [
        ("Summit Materials", "https://summit-materials.com/",
         "Summit Materials supplies aggregates and cement for construction and infrastructure."),
        ("Summit Electric Supply", "https://www.summit.com/about-us",
         "Summit has operated as a privately-owned, family-operated electrical distributor since 1977.")
    ],
    "Pinnacle": [
        ("Pinnacle Financial Partners", "https://pnfp.com/",
         "Pinnacle Financial Partners provides banking, investment and financial services."),
        ("Pinnacle West Capital Corporation", "https://www.pinnaclewest.com/about-us/default.aspx",
         "Pinnacle West Capital Corporation is an investor-owned electric utility holding company."),
        ("Pinnacle Foods Ltd", "https://www.pinnaclefoods.co.uk/",
         "Pinnacle Foods Ltd is a specialist meat and poultry processor.")
    ],
    "Evergreen": [
        ("Evergreen Marine", "https://www.evergreen-marine.com/",
         "Evergreen Marine Corporation is a container transportation and shipping company."),
        ("EvergreenHealth", "https://www.evergreenhealth.com/about-us/",
         "EvergreenHealth provides healthcare services and operates in the Seattle-area region.")
    ],
    "Frontier": [
        ("Frontier Airlines", "https://www.flyfrontier.com/about-us",
         "Frontier Airlines is headquartered in Denver, Colorado and operates an airline network."),
        ("Frontier Communications", "https://frontier.com/corporate/terms",
         "Frontier Communications Corporation provides telecommunications services.")
    ],
    "Heritage": [
        ("Heritage Insurance", "https://www.heritagepci.com/",
         "Heritage provides personal and commercial residential insurance products."),
        ("Heritage Foods Limited", "https://www.heritagefoods.in/corporate/about_us",
         "Heritage Foods is an Indian dairy company founded in 1992."),
        ("Heritage Foods USA", "https://heritagefoods.com/pages/who-we-are-1",
         "Heritage Foods is a mail-order and wholesale company founded in 2001.")
    ],
    "Beacon": [
        ("Beacon Roofing Supply", "https://www.qxo.com/welcome-to-beacon",
         "Beacon roofing brands have been consolidated into the QXO brand."),
        ("Beacon Biosignals", "https://beacon.bio/about",
         "Beacon Biosignals develops AI-driven neurotechnology for brain data.")
    ],
    "Sterling": [
        ("Sterling Infrastructure", "https://www.strlco.com/",
         "Sterling is an infrastructure services provider spanning e-infrastructure, building and transportation."),
        ("Sterling and Wilson Renewable Energy", "https://www.sterlingandwilsonre.com/about-us",
         "Sterling and Wilson operates as a global renewable-energy solutions provider.")
    ],
    "United": [
        ("United Airlines", "https://www.united.com/",
         "United operates commercial passenger air services."),
        ("United Rentals", "https://www.unitedrentals.com/our-company/about-us",
         "United Rentals, Inc. is a global equipment rental company.")
    ],
    "Liberty": [
        ("Liberty Mutual", "https://business.libertymutual.com/about-us/",
         "Liberty Mutual is an insurance and surety provider."),
        ("Liberty Energy", "https://libertyenergy.com/about/",
         "Liberty Energy provides oilfield services and technology.")
    ],
    "Phoenix": [
        ("Phoenix Contact", "https://www.phoenixcontact.com/en-us/company",
         "Phoenix Contact develops electrification, networking and automation solutions."),
        ("Phoenix Group", "https://www.thephoenixgroup.com/",
         "Phoenix Group is an insurance and savings business.")
    ],
    "Vertex": [
        ("Vertex Pharmaceuticals", "https://www.vrtx.com/",
         "Vertex is a global biotechnology company focused on serious diseases."),
        ("Vertex Inc.", "https://www.vertexinc.com/company/about-us",
         "Vertex is a global indirect-tax and compliance company.")
    ],
    "Compass": [
        ("Compass Group PLC", "https://www.compass-group.com/en/who-we-are.html",
         "Compass Group is a global provider of food and support services."),
        ("Compass Inc.", "https://www.compass.com/about/",
         "Compass is a technology-enabled residential real-estate brokerage.")
    ],
    "Clearwater": [
        ("Clearwater Analytics", "https://www.clearwateranalytics.com/",
         "Clearwater provides investment accounting, reporting and analytics technology."),
        ("Clearwater Paper Corporation", "https://www.clearwaterpaper.com/",
         "Clearwater Paper supplies paperboard packaging products.")
    ],
    "Equinox": [
        ("Equinox", "https://www.equinox.com/",
         "Equinox operates luxury fitness clubs and related wellness offerings."),
        ("Equinox Gold", "https://www.equinoxgold.com/about/",
         "Equinox Gold operates gold assets across Canada and the Americas.")
    ],
    "Acadia": [
        ("Acadia Healthcare", "https://www.acadiahealthcare.com/",
         "Acadia Healthcare operates behavioral-health treatment facilities."),
        ("Acadia Pharmaceuticals", "https://www.acadia.com/",
         "Acadia Pharmaceuticals is a biopharmaceutical company.")
    ],
    "Continental": [
        ("Continental AG", "https://www.continental.com/en/company/",
         "Continental is a tire manufacturer and automotive-industry specialist."),
        ("Continental Grain Company", "https://continentalgrain.com/about-us/",
         "Continental Grain is a privately owned investor and operator in food and agribusiness.")
    ],
    "Alliance": [
        ("AllianceBernstein", "https://www.alliancebernstein.com/corporate/en/home/about-us.html",
         "AllianceBernstein provides investment and wealth-management services."),
        ("Alliance Air", "https://www.allianceair.in/",
         "Alliance Air is an Indian regional airline.")
    ],
    "Aurora": [
        ("Aurora Innovation", "https://aurora.tech/",
         "Aurora develops self-driving technology."),
        ("Aurora Expeditions", "https://www.aurora-expeditions.com/about-us",
         "Aurora Expeditions runs small-group expeditions to remote regions.")
    ],
    "Apollo": [
        ("Apollo Global Management", "https://www.apollo.com/",
         "Apollo is an asset manager, capital provider, and provider of wealth and retirement solutions."),
        ("Apollo Hospitals", "https://www.apollohospitals.com/",
         "Apollo Hospitals operates a healthcare network in India.")
    ],
}

cases = []
case_num = 1

def source_objs(keys):
    out = []
    for key in keys:
        for name, url, excerpt in pairs[key]:
            out.append({"url": url, "excerpt": excerpt})
    return out

# 80 negatives/ambiguous: four materially different conditions for each collision-prone name.
# 1. Bare/common word collision
for q, opts in pairs.items():
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {},
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "bare_collision_name",
        "rationale": f'"{q}" is used by multiple real entities in the public record; no entity discriminator is supplied.',
        "evidence": source_objs([q]),
    })
    case_num += 1

# 2. Generic industry/context. Chosen to be non-unique or insufficient.
industries = {
    "Crown":"manufacturing",
    "Summit":"industrial services",
    "Pinnacle":"financial services",
    "Evergreen":"healthcare",
    "Frontier":"communications",
    "Heritage":"food",
    "Beacon":"technology",
    "Sterling":"infrastructure",
    "United":"transportation",
    "Liberty":"financial services",
    "Phoenix":"technology",
    "Vertex":"software",
    "Compass":"services",
    "Clearwater":"analytics",
    "Equinox":"consumer services",
    "Acadia":"healthcare",
    "Continental":"industrial",
    "Alliance":"financial services",
    "Aurora":"technology",
    "Apollo":"healthcare",
}
for q in pairs:
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {"industry": industries[q]},
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "generic_industry_context",
        "rationale": "Industry is generic context and does not uniquely identify the collision-prone company name.",
        "evidence": source_objs([q]),
    })
    case_num += 1

# 3. Country-only context.
countries = {
    "Crown":"Australia",
    "Summit":"United States",
    "Pinnacle":"United States",
    "Evergreen":"United States",
    "Frontier":"United States",
    "Heritage":"India",
    "Beacon":"United States",
    "Sterling":"India",
    "United":"United States",
    "Liberty":"United States",
    "Phoenix":"Germany",
    "Vertex":"United States",
    "Compass":"United States",
    "Clearwater":"United States",
    "Equinox":"Canada",
    "Acadia":"United States",
    "Continental":"United States",
    "Alliance":"India",
    "Aurora":"Sweden",
    "Apollo":"United States",
}
for q in pairs:
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {"country": countries[q]},
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "country_only_context",
        "rationale": "Country-only context is explicitly insufficient under the contract for a collision-prone name.",
        "evidence": source_objs([q]),
    })
    case_num += 1

# 4. Incidental geography.
geo = {
    "Crown":"event in Sydney",
    "Summit":"customers in Houston",
    "Pinnacle":"conference in Phoenix",
    "Evergreen":"patients travelling from Seattle",
    "Frontier":"customers in Toronto",
    "Heritage":"buyers in London",
    "Beacon":"conference in Boston",
    "Sterling":"projects discussed in Dubai",
    "United":"customers in Chicago",
    "Liberty":"clients in New York",
    "Phoenix":"conference in Berlin",
    "Vertex":"customers in Philadelphia",
    "Compass":"clients in New York",
    "Clearwater":"users in London",
    "Equinox":"customers in Vancouver",
    "Acadia":"patients in Florida",
    "Continental":"customers in New York",
    "Alliance":"passengers in Delhi",
    "Aurora":"travellers in Sydney",
    "Apollo":"patients in Hyderabad",
}
for q in pairs:
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {},
        "adversarial_metadata": {"geographic_mention": geo[q]},
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "incidental_geography",
        "rationale": "The geographic mention describes customers, events, travellers, or markets rather than headquarters or an operating location.",
        "evidence": source_objs([q]),
    })
    case_num += 1

# 5. Conflicting geography. Both candidate families are associated with other documented locations;
# the supplied location is a third place and cannot establish a primary identity.
conflicts = {
    "Crown":"Lisbon, Portugal",
    "Summit":"Nairobi, Kenya",
    "Pinnacle":"London, United Kingdom",
    "Evergreen":"Madrid, Spain",
    "Frontier":"Toronto, Canada",
    "Heritage":"Berlin, Germany",
    "Beacon":"Paris, France",
    "Sterling":"Cape Town, South Africa",
    "United":"Lagos, Nigeria",
    "Liberty":"Toronto, Canada",
    "Phoenix":"Nairobi, Kenya",
    "Vertex":"Sydney, Australia",
    "Compass":"Singapore",
    "Clearwater":"London, United Kingdom",
    "Equinox":"Rome, Italy",
    "Acadia":"Berlin, Germany",
    "Continental":"Lagos, Nigeria",
    "Alliance":"Cape Town, South Africa",
    "Aurora":"Toronto, Canada",
    "Apollo":"Paris, France",
}
for q in pairs:
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {"headquarters": conflicts[q]},
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "conflicting_geography",
        "rationale": "The supplied headquarters is not corroborated by the cited first-party identities; explicit mismatch prevents confident selection.",
        "evidence": source_objs([q]),
    })
    case_num += 1

# 6. Search popularity bias and 7. generic legal-form ambiguity: use a subset.
for q in list(pairs)[:5]:
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {},
        "adversarial_metadata": {
            "discovery_signal": "A dominant search result favors one well-known entity using this name."
        },
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "search_popularity_bias",
        "rationale": "Search-result popularity is not an entity discriminator and cannot override the underlying name collision.",
        "evidence": source_objs([q]),
    })
    case_num += 1

for q, legal_form in zip(list(pairs)[:5], ["Corporation","Limited","Inc.","PLC","Group"]):
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": q,
        "context": {},
        "adversarial_metadata": {"legal_form": legal_form},
        "expected_state": "AMBIGUOUS",
        "accepted_domains": [],
        "ground_truth_relationship": "UNKNOWN",
        "category": "generic_legal_form",
        "rationale": "The supplied legal form is generic and does not uniquely identify one of the competing entities.",
        "evidence": source_objs([q]),
    })
    case_num += 1

# 110 negatives exactly:
assert case_num - 1 == 110, case_num - 1

# 20 positives, intentionally distinct from all entities used in the negative set.
positive_data = [
    ("GitLab","gitlab.com",{"legal_name": "GitLab Inc.", "country": "United States"},
     "GitLab is a distinctive coined company name; first-party pages identify GitLab and corroborate the exact gitlab.com domain.",
     [
         {"url":"https://about.gitlab.com/company/team/","excerpt":"We're the company behind GitLab, the intelligent orchestration platform."},
         {"url":"https://ir.gitlab.com/","excerpt":"GitLab is the intelligent orchestration platform for DevSecOps."}
     ]),
    ("Snowflake","snowflake.com",{"legal_name": "Snowflake Inc.", "headquarters": "Bozeman"},
     "Snowflake is a distinctive name with first-party company information and exact snowflake.com correspondence.",
     [
         {"url":"https://www.snowflake.com/en/company/overview/about-snowflake/","excerpt":"Snowflake has become a global force to help every enterprise achieve its full potential through data and AI."},
         {"url":"https://www.snowflake.com/en/","excerpt":"Snowflake."}
     ]),
    ("Palantir","palantir.com",{"legal_name": "Palantir Technologies Inc.", "headquarters": "Denver"},
     "Palantir is distinctive and its first-party About page identifies the company at palantir.com.",
     [
         {"url":"https://www.palantir.com/about/","excerpt":"That’s why we founded Palantir."},
         {"url":"https://investors.palantir.com/","excerpt":"Palantir Technologies Inc."}
     ]),
    ("Mambu","mambu.com",{"legal_name": "Mambu B.V.", "headquarters": "Amsterdam"},
     "Mambu is a distinctive coined identity with first-party company evidence on mambu.com.",
     [
         {"url":"https://mambu.com/en/about-us","excerpt":"Mambu gives financial institutions the agility to evolve beyond legacy constraints."},
         {"url":"https://mambu.com/en/","excerpt":"Mambu."}
     ]),
    ("Personio","personio.com",{"legal_name": "Personio SE & Co. KG", "headquarters": "Munich"},
     "Personio is a distinctive coined identity; first-party company and legal pages establish Personio and the exact domain.",
     [
         {"url":"https://www.personio.com/about-personio/","excerpt":"Personio is Europe's leading HR software provider."},
         {"url":"https://www.personio.com/legal-notice/","excerpt":"Personio SE & Co. KG ... Website: www.personio.com"}
     ]),
    ("Pleo","pleo.io",{"legal_name": "Pleo Technologies ApS", "headquarters": "Copenhagen"},
     "Pleo is a distinctive coined identity, with first-party company history and exact pleo.io correspondence.",
     [
         {"url":"https://www.pleo.io/en/about","excerpt":"We’re Pleo and this is our story, so far."},
         {"url":"https://www.pleo.io/en/","excerpt":"Pleo is the spending solution for forward-thinking teams everywhere."}
     ]),
    ("Klaviyo","klaviyo.com",{"legal_name": "Klaviyo, Inc.", "headquarters": "Boston"},
     "Klaviyo is a distinctive coined identity with first-party About and corporate materials on klaviyo.com.",
     [
         {"url":"https://www.klaviyo.com/about","excerpt":"Klaviyo is a B2C CRM platform."},
         {"url":"https://investors.klaviyo.com/","excerpt":"Klaviyo investor relations."}
     ]),
    ("UiPath","uipath.com",{"legal_name": "UiPath Inc.", "headquarters": "New York"},
     "UiPath is a distinctive coined company identity with first-party company evidence and exact domain correspondence.",
     [
         {"url":"https://www.uipath.com/about-us","excerpt":"The company building your clear path to AI results."},
         {"url":"https://ir.uipath.com/","excerpt":"UiPath investor relations."}
     ]),
    ("Celonis","celonis.com",{"legal_name": "Celonis SE", "headquarters": "Munich"},
     "Celonis is a distinctive coined name with first-party company evidence on celonis.com.",
     [
         {"url":"https://www.celonis.com/company/about-us","excerpt":"About Celonis."},
         {"url":"https://www.celonis.com/","excerpt":"Celonis."}
     ]),
    ("Snyk","snyk.io",{"legal_name": "Snyk Limited", "location": "London"},
     "Snyk is a distinctive coined name; the first-party About page establishes the company at snyk.io.",
     [
         {"url":"https://snyk.io/about/","excerpt":"About Snyk."},
         {"url":"https://snyk.io/","excerpt":"Snyk."}
     ]),
    ("Huel","huel.com",{"legal_name": "Huel Limited", "location": "Tring"},
     "Huel is a distinctive coined brand/company identity, with first-party history and exact huel.com correspondence.",
     [
         {"url":"https://huel.com/pages/our-story","excerpt":"Huel was launched in 2015 to change the way people eat."},
         {"url":"https://huel.com/pages/about-us","excerpt":"Huel is nutritionally complete food."}
     ]),
    ("Hilti","hilti.com",{"legal_name": "Hilti Corporation", "headquarters": "Schaan"},
     "Hilti is a distinctive non-dictionary company name; first-party materials identify Hilti and its global headquarters.",
     [
         {"url":"https://www.hilti.com/content/company/about-hilti","excerpt":"Based in Schaan, Liechtenstein, family-owned Hilti provides the construction industry with advanced hardware, software, and services."},
         {"url":"https://www.hilti.com.ng/articles/about-hilti","excerpt":"Hilti Group was founded in 1941 ... with its global headquarters in the Principality of Liechtenstein."}
     ]),
    ("Maersk","maersk.com",{"legal_name": "A.P. Møller - Mærsk A/S", "headquarters": "Copenhagen"},
     "Maersk is a distinctive corporate name/short name with exact maersk.com correspondence and public corporate identity evidence.",
     [
         {"url":"https://www.maersk.com/","excerpt":"Maersk."},
         {"url":"https://www.maersk.com/about","excerpt":"Maersk provides integrated logistics and transport services."}
     ]),
    ("Safaricom","safaricom.co.ke",{"legal_name": "Safaricom PLC", "headquarters": "Nairobi"},
     "Safaricom is a distinctive coined name; its first-party site establishes the corporate identity and exact domain.",
     [
         {"url":"https://www.safaricom.co.ke/about/who-we-are","excerpt":"Our Story. We believe in reputation before revenue."},
         {"url":"https://www.safaricom.co.ke/","excerpt":"Safaricom."}
     ]),
    ("Dangote","dangote.com",{"legal_name": "Dangote Industries Limited", "headquarters": "Lagos"},
     "Dangote is a distinctive surname-based corporate identity; first-party materials identify Dangote Industries Limited and the exact domain.",
     [
         {"url":"https://www.dangote.com/about-us/","excerpt":"About Dangote Industries Limited."},
         {"url":"https://www.dangote.com/","excerpt":"Dangote Group."}
     ]),
    ("Canva","canva.com",{"legal_name": "Canva Pty Ltd", "headquarters": "Sydney"},
     "Canva is a distinctive coined identity with first-party company information and exact canva.com correspondence.",
     [
         {"url":"https://www.canva.com/about/","excerpt":"Launched in 2013, Canva is an online design and publishing tool."},
         {"url":"https://www.canva.com/","excerpt":"Canva."}
     ]),
    ("Chime","chime.com",{"legal_name": "Chime Financial, Inc.", "headquarters": "San Francisco"},
     "Chime is a distinctive service/company identity with first-party company information on chime.com.",
     [
         {"url":"https://www.chime.com/about-us/","excerpt":"Chime is a financial technology company."},
         {"url":"https://www.chime.com/","excerpt":"Chime."}
     ]),
    ("Stripe","stripe.com",{"legal_name": "Stripe, Inc.", "headquarters": "South San Francisco"},
     "Stripe is a distinctive company identity with first-party corporate information and exact stripe.com correspondence.",
     [
         {"url":"https://stripe.com/about","excerpt":"Stripe is a technology company focused on improving the conditions for economic growth and prosperity."},
         {"url":"https://stripe.com/","excerpt":"Stripe."}
     ]),
    ("DocuSign","docusign.com",{"legal_name": "DocuSign, Inc.", "headquarters": "San Francisco"},
     "DocuSign is a distinctive compound identity with first-party company information on docusign.com.",
     [
         {"url":"https://www.docusign.com/company","excerpt":"About Docusign."},
         {"url":"https://www.docusign.com/","excerpt":"DocuSign."}
     ]),
    ("lululemon","lululemon.com",{"legal_name": "Lululemon Athletica Inc.", "headquarters": "Vancouver"},
     "lululemon is a distinctive non-dictionary brand/company identity, with first-party company information and exact domain correspondence.",
     [
         {"url":"https://corporate.lululemon.com/about-us","excerpt":"We are a purpose-driven brand and our values guide us in all that we do."},
         {"url":"https://corporate.lululemon.com/","excerpt":"Our Business — technical athletic apparel, footwear, and accessories."}
     ]),
]

for name, domain, context, rationale, evidence in positive_data:
    case_num += 1
    cases.append({
        "case_id": f"blind-{case_num:03d}",
        "query_name": name,
        "context": context,
        "expected_state": "CONFIDENT",
        "accepted_domains": [domain],
        "ground_truth_relationship": "PRIMARY",
        "category": "distinctive_first_party_exact_domain",
        "rationale": rationale + " No subsidiary, parent, product, acquisition, or other related-entity relationship is being used as the requested identity.",
        "evidence": evidence,
    })

assert len(cases) == 130

state_counts = {}
category_counts = {}
for c in cases:
    state_counts[c["expected_state"]] = state_counts.get(c["expected_state"], 0) + 1
    category_counts[c["category"]] = category_counts.get(c["category"], 0) + 1
    assert c["expected_state"] in {"CONFIDENT","AMBIGUOUS","UNRESOLVED"}
    assert isinstance(c["accepted_domains"], list)
    assert c["ground_truth_relationship"] in {"PRIMARY","RELATED","UNKNOWN"}
    assert c["evidence"]

doc = {
    "corpus_version": "identity-v1.3.2-adversarial-policy-suite-1.0",
    "target_system": "identity-v1.3.2",
    "authoring_protocol": (
        "Adversarial policy test suite. Not independent. "
        "Contains highly structured, repeated permutations of 20 underlying entities "
        "and uses entities previously exposed during benchmark development. "
        "Designed to test edge cases, weak context rejection, and exact-domain resolution."
    ),
    "information_barrier_verification": {
        "information_barrier_respected": False,
        "reason": "Corpus generation was influenced by conversational context and exposed benchmark entities."
    },
    "schema_notes": {
        "expected_state": "Frozen expected evaluator outcome; never inferred from resolver output.",
        "accepted_domains": "Domains accepted as the canonical identity for CONFIDENT cases; empty for negative cases.",
        "ground_truth_relationship": "PRIMARY for the requested canonical entity; UNKNOWN where no canonical entity can be safely selected.",
        "context": "Only caller-visible identity context; no hidden target company is supplied."
    },
    "cases": cases,
    "case_count": len(cases),
    "expected_state_counts": state_counts,
    "category_counts": category_counts,
    "post_hash_mutation": False
}

# Serialize exactly once for the final artifact; calculate checksum from those exact bytes.
payload = json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")
OUT.write_bytes(payload)
sha256 = hashlib.sha256(payload).hexdigest()

print(json.dumps({
    "file_path": str(OUT),
    "sha256": sha256,
    "case_count": len(cases),
    "expected_state_counts": state_counts,
    "category_counts": category_counts,
    "resolver_executed": False,
    "information_barrier_respected": False,
    "post_hash_mutation": False
}, indent=2))
