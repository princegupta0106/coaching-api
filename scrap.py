import os
import re
import json
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright
from tqdm import tqdm

BASE_URL = "https://questions.examside.com"


# ---------------- CHAPTER URLS ----------------

CHAPTER_URLS = [
    
    "/past-years/jee/jee-main/physics/circular-motion",
    "/past-years/jee/jee-main/physics/laws-of-motion",
    "/past-years/jee/jee-main/physics/work-power-and-energy",
    "/past-years/jee/jee-main/physics/center-of-mass",
    "/past-years/jee/jee-main/physics/rotational-motion",
    "/past-years/jee/jee-main/physics/properties-of-matter",
    "/past-years/jee/jee-main/physics/heat-and-thermodynamics",
    "/past-years/jee/jee-main/physics/simple-harmonic-motion",
    "/past-years/jee/jee-main/physics/waves",
    "/past-years/jee/jee-main/physics/gravitation",
    "/past-years/jee/jee-main/physics/electrostatics",
    "/past-years/jee/jee-main/physics/current-electricity",
    "/past-years/jee/jee-main/physics/capacitor",
    "/past-years/jee/jee-main/physics/magnetics",
    "/past-years/jee/jee-main/physics/magnetic-properties-of-matter",
    "/past-years/jee/jee-main/physics/electromagnetic-induction",
    "/past-years/jee/jee-main/physics/alternating-current",
    "/past-years/jee/jee-main/physics/electromagnetic-waves",
    "/past-years/jee/jee-main/physics/wave-optics",
    "/past-years/jee/jee-main/physics/geometrical-optics",
    "/past-years/jee/jee-main/physics/atoms-and-nuclei",
    "/past-years/jee/jee-main/physics/dual-nature-of-radiation",
    "/past-years/jee/jee-main/physics/electronic-devices",
    "/past-years/jee/jee-main/physics/communication-systems",
]


# ---------------- HELPERS ----------------

def parse_subject_and_chapter(path):
    parts = path.strip("/").split("/")
    # parts = ['past-years', 'jee', 'jee-main', 'physics', 'circular-motion']
    exam = parts[2] if len(parts) > 2 else ""  # e.g., 'jee-main'
    subject = parts[3] if len(parts) > 3 else ""  # e.g., 'physics'
    chapter_slug = parts[4] if len(parts) > 4 else ""  # e.g., 'circular-motion'
    chapter_name = chapter_slug.replace("-", " ")
    return exam, subject, chapter_slug, chapter_name


def normalize_id(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def extract_metadata(header, exam_from_url):
    meta = {
        "exam": exam_from_url.replace("-", " "),  # Convert 'jee-main' to 'jee main'
        "year": "",
        "mode": "",
        "date": "",
        "shift": "",
        "marks": {"positive": None, "negative": None}
    }

    t = header.lower()

    y = re.search(r"(20\d{2})", t)
    if y:
        meta["year"] = y.group(1)

    if "online" in t:
        meta["mode"] = "online"

    if "morning" in t:
        meta["shift"] = "morning"
    elif "evening" in t:
        meta["shift"] = "evening"

    return meta


def extract_html(el):
    return el.inner_html().strip() if el else ""


def is_correct_option(opt):
    cls = (opt.get_attribute("class") or "").lower()
    if any(k in cls for k in ["correct", "green", "success"]):
        return True
    if opt.get_attribute("aria-checked") == "true":
        return True
    if opt.query_selector("span:has-text('Correct')"):
        return True
    return False


def extract_numeric_answer(root):
    text = root.inner_text()
    # Try multiple patterns: "Correct answer is X", "Correct Answer: X", "Correct Answer = X"
    patterns = [
        r"Correct answer is\s+([-+]?\d*\.?\d+)",
        r"Correct Answer\s*[:=]\s*([-+]?\d*\.?\d+)",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


# ---------------- SCRAPING ----------------

def extract_links(page):
    links = set()
    for a in page.query_selector_all("a[href*='/question/']"):
        href = a.get_attribute("href")
        if href:
            links.add(urljoin(BASE_URL, href))
    return list(links)


def scrape_question(page, url, idx, exam, subject, chapter_name):
    page.goto(url, timeout=60000)
    page.wait_for_selector(".question-component", timeout=20000)

    root = page.query_selector(".question-component")

    metadata = extract_metadata(
        root.query_selector(".font-semibold").inner_text(),
        exam
    )

    badge = root.query_selector(".px-1\\.5")
    qtype = badge.inner_text().lower() if badge else ""

    # Determine question type
    if "single" in qtype:
        question_type = "mcq_single"
    elif "more" in qtype or "multiple" in qtype:
        question_type = "mcq_multiple"
    elif "numerical" in qtype:
        question_type = "numerical"
    else:
        question_type = "other"

    question_html = extract_html(root.query_selector(".question"))

    options = []
    correct = []

    opt_root = root.query_selector(".options")
    if opt_root:
        for opt in opt_root.query_selector_all("[role='button']"):
            label = opt.query_selector("div:first-child").inner_text().strip().lower()
            options.append({"label": label, "html": opt.inner_html()})

    btn = page.query_selector("button:has-text('Check Answer')")
    if btn:
        btn.click()
        page.wait_for_timeout(400)

    answer = {"type": question_type, "value": None}

    # Only extract answers for known question types
    if question_type == "other":
        # Skip answer extraction for other types
        pass
    elif question_type.startswith("mcq") and opt_root:
        for opt in opt_root.query_selector_all("[role='button']"):
            label = opt.query_selector("div:first-child").inner_text().strip().lower()
            if is_correct_option(opt):
                correct.append(label)

        if question_type == "mcq_single" and correct:
            answer["value"] = correct[0]
        elif question_type == "mcq_multiple":
            answer["value"] = "".join(sorted(correct))

    elif question_type == "numerical":
        answer["value"] = extract_numeric_answer(root)

    explanation_html = ""
    h = page.query_selector("h2:has-text('Explanation')")
    if h:
        explanation_html = extract_html(h.evaluate_handle("e => e.nextElementSibling"))

    return {
        "id": f"{subject}-{normalize_id(chapter_name)}-{idx}",
        "source": "examgoal",
        "subject": subject,
        "chapter": chapter_name,
        "question_type": question_type,
        "metadata": metadata,
        "question_html": question_html,
        "options": options,
        "answer": answer,
        "explanation_html": explanation_html
    }


# ---------------- MAIN ----------------

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        def block_mathjax(route):
            url = route.request.url.lower()
            if "mathjax" in url and ("cdn.jsdelivr.net" in url or "cdnjs" in url):
                route.abort()
            else:
                route.continue_()

        context.route("**/*", block_mathjax)
        page = context.new_page()

        for chapter_path in CHAPTER_URLS:
            exam, subject, chapter_slug, chapter_name = parse_subject_and_chapter(chapter_path)
            chapter_url = BASE_URL + chapter_path

            # Create nested folder structure matching URL: data/jee/jee-main/physics/circular-motion
            out_dir = f"data/jee/{exam}/{subject}/{chapter_slug}"
            os.makedirs(out_dir, exist_ok=True)

            print(f"\n📘 Scraping: {exam} / {subject} / {chapter_name}")

            page.goto(chapter_url, timeout=60000)
            page.wait_for_selector("a[href*='/question/']", timeout=20000)

            links = extract_links(page)

            for i, qurl in enumerate(tqdm(links), 1):
                try:
                    data = scrape_question(page, qurl, i, exam, subject, chapter_name)
                    fname = f"{normalize_id(subject)}-{normalize_id(chapter_name)}-{i}.json"
                    with open(os.path.join(out_dir, fname), "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    print("❌", qurl, e)

        browser.close()


if __name__ == "__main__":
    main()
