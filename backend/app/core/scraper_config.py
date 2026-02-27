import re

def split_patterns(restriction_text):
    """Regex logic to extract Annex numbers and Reference numbers."""
    if not restriction_text: return None, None

    roman_list, number_list = [], []
    found_match = False
    
    p1 = re.compile(r'(II|III|IV|V|VI)(?:\s\/\s|\/|\s)(\d+[a-z]?)', re.IGNORECASE)
    p2 = re.compile(r'(II|III|IV|V|VI)(?:\/)(\d+[a-z]?)\s*(?:,|and)\s*(\d+[a-z]?)', re.IGNORECASE)
    p3 = re.compile(r'entry\s+(\d+[a-z]?)(?:\s+and\s+(\d+[a-z]?))?\s+of\s+Annex\s+II', re.IGNORECASE)

    # Logic 1: Pattern 2 (Compound)
    matches = p2.findall(restriction_text)
    if matches:
        found_match = True
        for m in matches:
            roman_list.extend([m[0], m[0]])
            number_list.extend([m[1], m[2]])

    # Logic 2: Pattern 1 (Simple)
    if not found_match:
        matches = p1.findall(restriction_text)
        if matches:
            found_match = True
            seen = set()
            for m in matches:
                key = f"{m[0]}-{m[1]}".upper()
                if key not in seen:
                    seen.add(key)
                    roman_list.append(m[0])
                    number_list.append(m[1])

    # Logic 3: Pattern 3 (Annex II textual)
    if not found_match:
        matches = p3.findall(restriction_text)
        if matches:
            found_match = True
            for m in matches:
                if m[1]: 
                    roman_list.extend(["II", "II"])
                    number_list.extend([m[0], m[1]])
                else:
                    roman_list.append("II")
                    number_list.append(m[0])

    if not found_match: return None, None
    return roman_list, number_list

def process_data(scraper, input_name):
    """Main logic to process a single ingredient name."""
    
    # 1. Search (using JS Injection)
    raw_results = scraper.search_ingredient(input_name)
    
    # 2. Filter
    matched_items = scraper.find_exact_match(input_name, raw_results)
    
    if not matched_items:
        return [{
            "Input Name": input_name, "Match Status": "NOT FOUND",
            "Restriction": "-", "Function": "-", "Annex No": "-", 
            "Annex Ref": "-", "Product Type": "-", "Max Conc": "-", "SCCS Opinion": "-"
        }]

    output_rows = []
    for item in matched_items:
        meta = item.get('metadata', {})
        
        restriction_raw = meta.get('cosmeticRestriction', '')
        if isinstance(restriction_raw, list): restriction_raw = "\n".join(restriction_raw)
        
        func_raw = meta.get('functionName', '')
        if isinstance(func_raw, list): func_raw = "\n".join(func_raw)

        # Parse Annex Info
        annex_nos, annex_refs = [], []
        
        if not restriction_raw:
            a_no = meta.get('annexNo', [])
            a_ref = meta.get('refNo', [])
            annex_nos = a_no if isinstance(a_no, list) else [a_no]
            annex_refs = a_ref if isinstance(a_ref, list) else [a_ref]
        else:
            r_list, n_list = split_patterns(restriction_raw)
            if r_list:
                annex_nos, annex_refs = r_list, n_list
            else:
                annex_nos = ["None"]

        # Deep Fetch Metadata from Annexes (using CDP Interception if needed)
        prod_types, max_concs, opinions = [], [], []

        if annex_nos and annex_refs and len(annex_nos) == len(annex_refs) and annex_nos[0] != "None":
            for idx, annex_roman in enumerate(annex_nos):
                if not annex_roman: continue
                
                ref_digit = annex_refs[idx]
                
                # Retrieve Annex Data (triggers Interception only if not cached)
                annex_db = scraper.get_annex_data(str(annex_roman).strip())
                
                match_meta = annex_db.get(str(ref_digit).strip().upper())
                header = f"{annex_roman}/{ref_digit}: "
                
                if match_meta:
                    pt = match_meta.get('productTypeBodyParts', [])
                    mc = match_meta.get('maximumConcentration', [])
                    sc = match_meta.get('sccsOpinion', [])
                    
                    prod_types.append(header + (", ".join(pt) if isinstance(pt, list) else str(pt)))
                    max_concs.append(header + (", ".join(mc) if isinstance(mc, list) else str(mc)))
                    opinions.append(header + (", ".join(sc) if isinstance(sc, list) else str(sc)))

        output_rows.append({
            "Input Name": input_name,
            "Match Status": "FOUND",
            "Restriction": restriction_raw,
            "Function": func_raw,
            "Annex No": "\n".join([str(x) for x in annex_nos if x]),
            "Annex Ref": "\n".join([str(x) for x in annex_refs if x]),
            "Product Type": "\n".join(prod_types),
            "Max Conc": "\n".join(max_concs),
            "SCCS Opinion": "\n".join(opinions)
        })
        
    return output_rows

