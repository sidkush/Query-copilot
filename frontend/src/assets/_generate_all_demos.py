"""
Generate 4 animated demo GIFs for QueryCopilot:
  1. Multi-DB Connection flow
  2. DB Switching
  3. ER Diagram with drag
  4. Billing
"""

from PIL import Image, ImageDraw, ImageFont
import os, math

W, H = 800, 500
BG = (13, 13, 13)
CARD_BG = (17, 24, 39)
BORDER = (31, 41, 55)
INDIGO = (99, 102, 241)
INDIGO_DIM = (67, 56, 202)
GREEN = (52, 211, 153)
GREEN_DARK = (6, 78, 59)
CYAN = (34, 211, 238)
YELLOW = (253, 224, 71)
RED = (248, 113, 113)
ORANGE = (251, 146, 60)
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)
DARK_GRAY = (75, 85, 99)
PURPLE = (139, 92, 246)
BLUE = (59, 130, 246)

def get_font(size):
    for fp in ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf"]:
        if os.path.exists(fp): return ImageFont.truetype(fp, size)
    return ImageFont.load_default()

def get_ui_font(size):
    for fp in ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]:
        if os.path.exists(fp): return ImageFont.truetype(fp, size)
    return ImageFont.load_default()

def get_bold_font(size):
    for fp in ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
        if os.path.exists(fp): return ImageFont.truetype(fp, size)
    return get_ui_font(size)

fm = get_font(14)
fm_sm = get_font(12)
fm_xs = get_font(10)
fu = get_ui_font(14)
fu_sm = get_ui_font(12)
fu_xs = get_ui_font(10)
fu_lg = get_ui_font(18)
fb = get_bold_font(16)
fb_sm = get_bold_font(14)
fb_lg = get_bold_font(22)
fb_xl = get_bold_font(28)
fb_xs = get_bold_font(12)

def rr(draw, xy, fill, r=12, outline=None):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline)

def btn(draw, xy, text, fill=INDIGO, tc=WHITE, font=fb_sm):
    x1,y1,x2,y2 = xy
    rr(draw, xy, fill, r=8)
    tw = draw.textlength(text, font=font)
    draw.text((x1+(x2-x1-tw)/2, y1+(y2-y1-14)/2), text, fill=tc, font=font)

def draw_sidebar(draw, active_page="chat"):
    sw = 56
    draw.rectangle((0, 0, sw, H), fill=(10, 10, 18))
    draw.line((sw, 0, sw, H), fill=BORDER)
    # Logo
    rr(draw, (12, 12, 44, 44), INDIGO, r=10)
    draw.text((18, 18), "Q", fill=WHITE, font=fb)
    # Nav icons
    icons = [("chat", 70), ("db", 120), ("schema", 170), ("billing", 220)]
    for name, y in icons:
        is_active = name == active_page
        if is_active:
            rr(draw, (8, y, 48, y+40), (99, 102, 241, 30), r=8)
        color = WHITE if is_active else DARK_GRAY
        if name == "chat":
            draw.rounded_rectangle((18, y+10, 38, y+30), radius=4, outline=color, width=2)
            draw.line((22, y+18, 34, y+18), fill=color, width=1)
            draw.line((22, y+23, 30, y+23), fill=color, width=1)
        elif name == "db":
            draw.ellipse((18, y+10, 38, y+22), outline=color, width=2)
            draw.line((18, y+16, 18, y+26), fill=color, width=2)
            draw.line((38, y+16, 38, y+26), fill=color, width=2)
            draw.arc((18, y+20, 38, y+32), 0, 180, fill=color, width=2)
        elif name == "schema":
            draw.rounded_rectangle((18, y+8, 30, y+20), radius=2, outline=color, width=2)
            draw.rounded_rectangle((26, y+20, 38, y+32), radius=2, outline=color, width=2)
            draw.line((30, y+14, 26, y+26), fill=color, width=1)
        elif name == "billing":
            draw.rounded_rectangle((18, y+10, 38, y+30), radius=4, outline=color, width=2)
            draw.line((18, y+18, 38, y+18), fill=color, width=1)
    # User avatar at bottom
    draw.ellipse((14, H-44, 42, H-16), fill=INDIGO_DIM)
    draw.text((23, H-37), "A", fill=WHITE, font=fb_xs)


def draw_header(draw, title, subtitle="", sx=70):
    draw.text((sx, 16), title, fill=WHITE, font=fb_lg)
    if subtitle:
        draw.text((sx, 44), subtitle, fill=GRAY, font=fu_sm)


# ═══════════════════════════════════════════════════════════
# GIF 1: Multi-DB Connection (16 databases, categorized)
# Matches the actual Dashboard.jsx layout exactly:
#   - 3-column responsive grid per category
#   - Gradient icon square (48×48 rounded) + bold name + gray desc
#   - Category section headers with subtitle
#   - Connection form with label + field inputs
#   - Connecting overlay with spinner ring
#   - Success overlay with checkmark
# ═══════════════════════════════════════════════════════════

DB_CATEGORIES = [
    ("Relational Databases", "Traditional SQL databases for transactional workloads", [
        ("PostgreSQL", (59,130,246), (37,99,235), "Advanced open-source relational database"),
        ("MySQL", (249,115,22), (194,65,12), "World's most popular open-source database"),
        ("MariaDB", (20,184,166), (13,148,136), "MySQL-compatible community-driven fork"),
        ("SQLite", (107,114,128), (75,85,99), "Embedded file-based database \u2014 zero setup"),
        ("SQL Server", (239,68,68), (185,28,28), "Microsoft enterprise relational database"),
        ("CockroachDB", (168,85,247), (126,34,206), "Distributed SQL \u2014 PostgreSQL compatible"),
    ]),
    ("Cloud Data Warehouses", "Scalable cloud-native analytics platforms", [
        ("Snowflake", (6,182,212), (8,145,178), "Multi-cloud data warehouse"),
        ("BigQuery", (99,102,241), (79,70,229), "Google Cloud serverless analytics"),
        ("Redshift", (234,88,12), (180,52,8), "AWS cloud data warehouse"),
        ("Databricks", (239,68,68), (194,48,48), "Data lakehouse analytics"),
    ]),
    ("Analytics Engines", "High-performance query engines for large-scale data", [
        ("ClickHouse", (234,179,8), (202,138,4), "Column-oriented OLAP database"),
        ("DuckDB", (217,160,60), (180,120,30), "In-process analytical database"),
        ("Trino", (96,165,250), (59,130,246), "Distributed SQL query engine"),
    ]),
    ("Enterprise Databases", "Mission-critical enterprise database systems", [
        ("Oracle", (185,28,28), (153,27,27), "Enterprise-grade relational database"),
        ("SAP HANA", (37,99,235), (29,78,216), "In-memory enterprise platform"),
        ("IBM Db2", (29,78,216), (30,64,175), "IBM enterprise data server"),
    ]),
]

# Cylinder DB icon as a tiny helper
def _draw_db_icon(draw, cx, cy, color=WHITE, sz=10):
    """Draw a small cylinder database icon centred at (cx, cy)."""
    l, r = cx - sz, cx + sz
    t = cy - sz
    b = cy + sz
    m = cy
    draw.arc((l, t, r, t+8), 180, 360, fill=color, width=1)
    draw.arc((l, t, r, t+8), 0, 180, fill=color, width=1)
    draw.line((l, t+4, l, b-4), fill=color, width=1)
    draw.line((r, t+4, r, b-4), fill=color, width=1)
    draw.arc((l, b-8, r, b), 0, 180, fill=color, width=1)
    draw.arc((l, m-4, r, m+4), 0, 180, fill=color, width=1)


def db_card(draw, x, y, w, h, name, grad_top, grad_bot, desc, selected=False, connected=False):
    """Draw one DB card matching Dashboard.jsx: rounded-2xl card with gradient icon square."""
    outline = INDIGO if selected else BORDER
    ow = 2 if selected else 1
    # Card background
    rr(draw, (x, y, x+w, y+h), CARD_BG, r=14, outline=outline)
    # Gradient icon square (48×48)
    icon_sz = 40
    ix, iy = x + 14, y + 14
    # Simulate gradient: top half → grad_top, bottom half → grad_bot
    rr(draw, (ix, iy, ix+icon_sz, iy+icon_sz), grad_top, r=10)
    draw.rectangle((ix+2, iy+icon_sz//2, ix+icon_sz-2, iy+icon_sz-2), fill=grad_bot)
    rr(draw, (ix, iy+icon_sz//2-2, ix+icon_sz, iy+icon_sz), grad_bot, r=10)
    rr(draw, (ix, iy, ix+icon_sz, iy+icon_sz//2+2), grad_top, r=10)
    # DB cylinder icon inside
    _draw_db_icon(draw, ix + icon_sz//2, iy + icon_sz//2, WHITE, 9)
    # Name
    draw.text((x + 14, y + 60), name, fill=WHITE, font=fb_xs)
    # Description (truncate to fit)
    max_desc_w = w - 28
    display_desc = desc
    while draw.textlength(display_desc, font=fu_xs) > max_desc_w and len(display_desc) > 10:
        display_desc = display_desc[:len(display_desc)-4] + "..."
    draw.text((x + 14, y + 78), display_desc, fill=DARK_GRAY, font=fu_xs)
    # Green dot if connected
    if connected:
        draw.ellipse((x+w-18, y+8, x+w-6, y+20), fill=GREEN)


def frame_db_catalog(scroll_offset=0, selected=None, connected_dbs=None):
    """Draw the full 16-DB categorized Dashboard, matching actual UI layout."""
    if connected_dbs is None: connected_dbs = []
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_sidebar(draw, "db")

    # Header bar with border
    draw.rectangle((56, 0, W, 62), fill=(17, 24, 39, 128))
    draw.line((56, 62, W, 62), fill=BORDER)
    draw.text((74, 14), "Connect Database", fill=WHITE, font=fb)
    draw.text((74, 38), "Choose a database engine to get started", fill=DARK_GRAY, font=fu_xs)

    # Content area
    sx = 74
    content_w = W - sx - 20
    cols = 3
    gap = 12
    card_w = (content_w - gap * (cols - 1)) // cols
    card_h = 100
    y = 76 - scroll_offset

    for cat_title, cat_sub, dbs in DB_CATEGORIES:
        # Section header
        if -20 < y < H:
            draw.text((sx, y), cat_title, fill=WHITE, font=fb_sm)
        if -10 < y+16 < H:
            draw.text((sx, y + 16), cat_sub, fill=DARK_GRAY, font=fu_xs)
        y += 34
        # Cards grid
        for i, (name, g1, g2, desc) in enumerate(dbs):
            col = i % cols
            row = i // cols
            cx = sx + col * (card_w + gap)
            cy = y + row * (card_h + gap)
            if -card_h < cy < H:
                db_card(draw, cx, cy, card_w, card_h, name, g1, g2, desc,
                        selected=(selected == name),
                        connected=(name in connected_dbs))
        rows_needed = math.ceil(len(dbs) / cols)
        y += rows_needed * (card_h + gap) + 16

    return img, draw


def frame_db_form(db_name, db_color, fields_filled=0, connected_dbs=None):
    """Connection form page (replaces catalog when a card is clicked)."""
    if connected_dbs is None: connected_dbs = []
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_sidebar(draw, "db")

    # Header
    draw.rectangle((56, 0, W, 62), fill=(17, 24, 39, 128))
    draw.line((56, 62, W, 62), fill=BORDER)
    draw.text((74, 14), "Connect Database", fill=WHITE, font=fb)
    draw.text((74, 38), "Choose a database engine to get started", fill=DARK_GRAY, font=fu_xs)

    # Back link
    draw.text((90, 76), "\u2190 Back to databases", fill=DARK_GRAY, font=fu_sm)

    # Form card — centred
    fw, fh = 380, 310
    fx = 56 + (W - 56 - fw) // 2
    fy = 100
    rr(draw, (fx, fy, fx+fw, fy+fh), CARD_BG, r=16, outline=BORDER)

    # Icon + title inside card
    rr(draw, (fx+20, fy+18, fx+52, fy+50), db_color, r=8)
    _draw_db_icon(draw, fx+36, fy+34, WHITE, 7)
    draw.text((fx+62, fy+24), db_name, fill=WHITE, font=fb)

    # Fields
    if db_name == "PostgreSQL":
        fields = [("Host", "db.mycompany.com"), ("Port", "5432"),
                  ("Database", "analytics_prod"), ("Username", "readonly_user"),
                  ("Password", "")]
    elif db_name == "DuckDB":
        fields = [("Database Path", ":memory:")]
    else:
        fields = [("Host", "mysql.staging.io"), ("Port", "3306"),
                  ("Database", "sales_db"), ("Username", "report_user"),
                  ("Password", "")]

    field_w = fw - 40
    for i, (label, val) in enumerate(fields):
        if not label:
            continue
        field_y = fy + 70 + i * 44
        draw.text((fx + 20, field_y), label, fill=GRAY, font=fu_xs)
        filled = i < fields_filled
        bord = INDIGO if i == fields_filled else BORDER
        rr(draw, (fx+20, field_y+14, fx+20+field_w, field_y+38), (31,41,55), r=8, outline=bord)
        if filled:
            is_pwd = "password" in label.lower()
            txt = "\u2022" * 8 if is_pwd else val
            draw.text((fx+30, field_y+18), txt, fill=WHITE, font=fu_sm)

    # Connect & Save button
    total = len([f for f in fields if f[0]])
    bx1, by1 = fx+20, fy+fh-48
    bx2, by2 = fx+fw-20, fy+fh-14
    if fields_filled >= total:
        btn(draw, (bx1, by1, bx2, by2), "Connect & Save", font=fb_sm)
    else:
        rr(draw, (bx1, by1, bx2, by2), DARK_GRAY, r=10)
        tw = draw.textlength("Connect & Save", font=fb_sm)
        draw.text((bx1+(bx2-bx1-tw)/2, by1+7), "Connect & Save", fill=(100,100,100), font=fb_sm)

    return img


def frame_db_connecting(db_name):
    """Full-screen connecting overlay with pulsing ring."""
    img = Image.new("RGB", (W, H), (5, 5, 8))
    draw = ImageDraw.Draw(img)
    # Centered content
    cx, cy = W // 2, H // 2 - 30
    # Outer rings
    for r_off, alpha in [(48, 60), (42, 40)]:
        draw.ellipse((cx-r_off, cy-r_off, cx+r_off, cy+r_off),
                      outline=(99, 102, 241, alpha), width=2)
    # Inner circle with icon
    draw.ellipse((cx-30, cy-30, cx+30, cy+30), fill=CARD_BG, outline=BORDER, width=1)
    _draw_db_icon(draw, cx, cy, INDIGO, 12)
    # Spinner arc
    draw.arc((cx-38, cy-38, cx+38, cy+38), 30, 300, fill=INDIGO, width=3)
    # Text
    t1 = f"Connecting to {db_name}..."
    tw1 = draw.textlength(t1, font=fb)
    draw.text((cx - tw1/2, cy + 50), t1, fill=WHITE, font=fb)
    t2 = "Discovering schema and training AI"
    tw2 = draw.textlength(t2, font=fu_sm)
    draw.text((cx - tw2/2, cy + 76), t2, fill=DARK_GRAY, font=fu_sm)
    # Bouncing dots
    for di in range(3):
        draw.ellipse((cx-12+di*12, cy+100, cx-6+di*12, cy+106), fill=INDIGO)
    return img


def frame_db_connected(db_name, db_count):
    """Full-screen success overlay with green checkmark."""
    img = Image.new("RGB", (W, H), (5, 5, 8))
    draw = ImageDraw.Draw(img)
    cx, cy = W // 2, H // 2 - 30
    # Green circle
    draw.ellipse((cx-38, cy-38, cx+38, cy+38), fill=GREEN_DARK, outline=GREEN, width=2)
    # Checkmark
    draw.line([(cx-16, cy), (cx-4, cy+14), (cx+18, cy-12)], fill=GREEN, width=4)
    # Text
    t1 = "Connected!"
    tw1 = draw.textlength(t1, font=fb)
    draw.text((cx - tw1/2, cy + 52), t1, fill=WHITE, font=fb)
    t2 = f"Loading schema explorer..."
    tw2 = draw.textlength(t2, font=fu_sm)
    draw.text((cx - tw2/2, cy + 78), t2, fill=DARK_GRAY, font=fu_sm)
    return img


def generate_multidb_gif():
    frames, durs = [], []

    # Scene 1: Full catalog — all 16 DBs visible (top portion)
    img, _ = frame_db_catalog()
    frames.append(img); durs.append(2500)

    # Scene 2: Smooth scroll to reveal Analytics & Enterprise sections
    for offset in [30, 60, 100, 140, 180]:
        img, _ = frame_db_catalog(scroll_offset=offset)
        frames.append(img); durs.append(350)
    frames.append(frames[-1]); durs.append(1200)

    # Scene 3: Scroll back up, then highlight PostgreSQL
    for offset in [120, 60, 0]:
        img, _ = frame_db_catalog(scroll_offset=offset)
        frames.append(img); durs.append(250)
    img, _ = frame_db_catalog(selected="PostgreSQL")
    frames.append(img); durs.append(900)

    # Scene 4: PostgreSQL form — fill fields one by one
    for i in range(6):
        frames.append(frame_db_form("PostgreSQL", BLUE, i))
        durs.append(500)
    frames.append(frame_db_form("PostgreSQL", BLUE, 5)); durs.append(700)

    # Scene 5: Connecting overlay
    frames.append(frame_db_connecting("PostgreSQL")); durs.append(2000)

    # Scene 6: Connected!
    frames.append(frame_db_connected("PostgreSQL", 1)); durs.append(1500)

    # Scene 7: Back to catalog with PG showing green connected dot
    img, _ = frame_db_catalog(connected_dbs=["PostgreSQL"])
    frames.append(img); durs.append(1500)

    # Scene 8: Scroll down to DuckDB, highlight it
    img, _ = frame_db_catalog(scroll_offset=80, connected_dbs=["PostgreSQL"])
    frames.append(img); durs.append(400)
    img, _ = frame_db_catalog(scroll_offset=80, connected_dbs=["PostgreSQL"], selected="DuckDB")
    frames.append(img); durs.append(900)

    # Scene 9: DuckDB form — only 1 field (path)
    frames.append(frame_db_form("DuckDB", (217,160,60), 0, ["PostgreSQL"]))
    durs.append(600)
    frames.append(frame_db_form("DuckDB", (217,160,60), 1, ["PostgreSQL"]))
    durs.append(700)

    # Scene 10: Connecting DuckDB
    frames.append(frame_db_connecting("DuckDB")); durs.append(1800)

    # Scene 11: DuckDB Connected
    frames.append(frame_db_connected("DuckDB", 2)); durs.append(1500)

    # Scene 12: Final catalog — both PG + DuckDB with green dots
    img, _ = frame_db_catalog(connected_dbs=["PostgreSQL", "DuckDB"])
    frames.append(img); durs.append(3000)

    return frames, durs


# ═══════════════════════════════════════════════════════════
# GIF 2: DB Switching
# ═══════════════════════════════════════════════════════════

def draw_db_badges(draw, active_db, sx=70):
    dbs = [
        ("analytics_prod", "PostgreSQL", BLUE, True),
        ("sales_db", "MySQL", ORANGE, True),
        ("MARKETING", "Snowflake", CYAN, False),
    ]
    x = sx
    y = 46
    for name, typ, color, connected in dbs:
        is_active = (name == active_db)
        dot_color = GREEN if connected else RED
        badge_bg = (99, 102, 241, 40) if is_active else (31, 41, 55)
        border_c = INDIGO if is_active else BORDER

        tw = draw.textlength(f"{name}", font=fu_xs) + 30
        rr(draw, (x, y, x+tw, y+26), badge_bg, r=13, outline=border_c)
        draw.ellipse((x+8, y+8, x+18, y+18), fill=dot_color)
        draw.text((x+22, y+6), name, fill=WHITE if is_active else GRAY, font=fu_xs)
        x += tw + 8

def frame_chat_with_db(active_db, query="", response=None, dropdown_open=False):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_sidebar(draw, "chat")
    draw_header(draw, "Chat", "")
    draw_db_badges(draw, active_db)

    # Chat messages area
    if response:
        # User message
        rr(draw, (W-320, 85, W-30, 120), INDIGO_DIM, r=12)
        draw.text((W-310, 92), response["q"], fill=WHITE, font=fu_sm)

        # AI response
        rr(draw, (80, 135, W-30, 135 + response["h"]), CARD_BG, r=12, outline=BORDER)
        draw.ellipse((90, 142, 108, 160), fill=PURPLE)
        draw.text((95, 145), "AI", fill=WHITE, font=fm_xs)
        draw.text((115, 144), "QueryCopilot", fill=WHITE, font=fb_xs)

        y = 168
        for line in response["lines"]:
            color = line[1] if len(line) > 1 else WHITE
            draw.text((100, y), line[0], fill=color, font=fu_sm if color == WHITE else fm_sm)
            y += 18

    # Query input at bottom
    qy = H - 70
    rr(draw, (70, qy, W-20, qy+55), CARD_BG, r=16, outline=BORDER)

    # DB selector dropdown in input
    db_short = active_db.split("_")[0][:8]
    rr(draw, (82, qy+12, 180, qy+42), (31, 41, 55), r=8, outline=DARK_GRAY)
    draw.ellipse((90, qy+20, 98, qy+28), fill=GREEN)
    draw.text((102, qy+17), db_short, fill=WHITE, font=fu_xs)
    draw.text((162, qy+18), "\u25BE", fill=GRAY, font=fu_xs)

    if query:
        draw.text((192, qy+18), query, fill=WHITE, font=fu)
    else:
        draw.text((192, qy+18), "Ask a question...", fill=DARK_GRAY, font=fu)

    # Send button
    draw.ellipse((W-58, qy+12, W-30, qy+40), fill=INDIGO)
    draw.polygon([(W-50, qy+26), (W-38, qy+20), (W-38, qy+32)], fill=WHITE)

    # Dropdown menu
    if dropdown_open:
        rr(draw, (82, qy-80, 280, qy+5), CARD_BG, r=10, outline=BORDER)
        dbs = [("analytics_prod", "PostgreSQL", GREEN), ("sales_db", "MySQL", GREEN), ("MARKETING", "Snowflake", RED)]
        for i, (name, typ, dot) in enumerate(dbs):
            iy = qy - 72 + i * 26
            is_active = name == active_db
            if is_active:
                rr(draw, (86, iy, 276, iy+24), (99, 102, 241, 30), r=6)
            draw.ellipse((94, iy+7, 104, iy+17), fill=dot)
            draw.text((110, iy+4), f"{name} ({typ})", fill=WHITE if is_active else GRAY, font=fu_xs)

    return img

def generate_switching_gif():
    frames, durs = [], []

    pg_response = {
        "q": "Show monthly revenue trend",
        "h": 130,
        "lines": [
            ("SELECT DATE_TRUNC('month', created_at),", CYAN),
            ("  SUM(amount) AS revenue", CYAN),
            ("FROM orders GROUP BY 1 ORDER BY 1;", CYAN),
            ("", WHITE),
            ("Result: 12 rows returned", GREEN),
            ("\u2588\u2588\u2588\u2588\u2588\u2588  Jan: $142K", WHITE),
            ("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 Feb: $189K", WHITE),
        ]
    }

    mysql_response = {
        "q": "Top 5 sales reps this quarter",
        "h": 130,
        "lines": [
            ("SELECT rep_name, SUM(deal_value)", CYAN),
            ("FROM deals WHERE QUARTER(close_date)", CYAN),
            ("  = QUARTER(NOW()) LIMIT 5;", CYAN),
            ("", WHITE),
            ("Result: 5 rows returned", GREEN),
            ("1. Sarah K.  $284,500", WHITE),
            ("2. Mike R.   $231,200", WHITE),
        ]
    }

    # Scene 1: Chat with PostgreSQL
    frames.append(frame_chat_with_db("analytics_prod", response=pg_response)); durs.append(2500)

    # Scene 2: Open dropdown
    frames.append(frame_chat_with_db("analytics_prod", response=pg_response, dropdown_open=True)); durs.append(1500)

    # Scene 3: Select MySQL
    frames.append(frame_chat_with_db("sales_db", response=pg_response, dropdown_open=True)); durs.append(800)

    # Scene 4: MySQL selected, dropdown closed
    frames.append(frame_chat_with_db("sales_db")); durs.append(1000)

    # Scene 5: Type query for MySQL
    q = "Top 5 sales reps this quarter"
    for i in range(0, len(q)+1, 3):
        frames.append(frame_chat_with_db("sales_db", query=q[:i]))
        durs.append(80)
    frames.append(frame_chat_with_db("sales_db", query=q)); durs.append(500)

    # Scene 6: MySQL response
    frames.append(frame_chat_with_db("sales_db", response=mysql_response)); durs.append(3000)

    # Scene 7: Switch back via dropdown
    frames.append(frame_chat_with_db("sales_db", response=mysql_response, dropdown_open=True)); durs.append(1200)
    frames.append(frame_chat_with_db("analytics_prod")); durs.append(2000)

    return frames, durs


# ═══════════════════════════════════════════════════════════
# GIF 3: ER Diagram with drag
# ═══════════════════════════════════════════════════════════

def draw_er_table(draw, x, y, name, columns, highlight=False):
    w, row_h = 160, 18
    h = 30 + len(columns) * row_h + 6
    border = INDIGO if highlight else BORDER
    shadow = (20, 20, 30)
    # Shadow
    rr(draw, (x+3, y+3, x+w+3, y+h+3), shadow, r=8)
    # Card
    rr(draw, (x, y, x+w, y+h), CARD_BG, r=8, outline=border)
    # Header gradient bar
    rr(draw, (x, y, x+w, y+28), INDIGO if not highlight else PURPLE, r=8)
    draw.rectangle((x, y+14, x+w, y+28), fill=INDIGO if not highlight else PURPLE)
    draw.text((x + (w - draw.textlength(name, font=fb_xs))/2, y+6), name, fill=WHITE, font=fb_xs)

    # Columns
    for i, (col_name, col_type) in enumerate(columns):
        cy = y + 34 + i * row_h
        dot_color = YELLOW if col_type == "PK" else BLUE if col_type == "FK" else DARK_GRAY
        draw.ellipse((x+10, cy+3, x+18, cy+11), fill=dot_color)
        draw.text((x+22, cy), col_name, fill=WHITE, font=fm_xs)
        type_label = col_type if col_type not in ("PK","FK") else ""
        if type_label:
            draw.text((x+w-40, cy), type_label, fill=DARK_GRAY, font=fm_xs)

    return x, y, w, h

def draw_relationship(draw, x1, y1, w1, h1, x2, y2, w2, h2, color=BLUE):
    # Draw curved line from right side of table1 to left side of table2
    sx = x1 + w1
    sy = y1 + h1 // 2
    ex = x2
    ey = y2 + h2 // 2

    # If target is to the left, connect differently
    if ex < sx:
        sx = x1
        ex = x2 + w2

    cp1x = sx + (ex - sx) * 0.4
    cp2x = sx + (ex - sx) * 0.6

    points = []
    for t in [i/20.0 for i in range(21)]:
        px = (1-t)**3*sx + 3*(1-t)**2*t*cp1x + 3*(1-t)*t**2*cp2x + t**3*ex
        py = (1-t)**3*sy + 3*(1-t)**2*t*sy + 3*(1-t)*t**2*ey + t**3*ey
        points.append((px, py))

    for i in range(len(points)-1):
        draw.line([points[i], points[i+1]], fill=color, width=2)

    # Arrow at end
    draw.polygon([(ex, ey), (ex-8, ey-5), (ex-8, ey+5)], fill=color)

def frame_er_diagram(table_positions, dragging=None, drag_highlight=None):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_sidebar(draw, "schema")
    draw_header(draw, "Schema Explorer", "Drag tables to rearrange \u00b7 Click to inspect")

    # Legend
    lx = W - 200
    draw.ellipse((lx, 18, lx+8, 26), fill=YELLOW)
    draw.text((lx+12, 16), "PK", fill=GRAY, font=fm_xs)
    draw.ellipse((lx+40, 18, lx+48, 26), fill=BLUE)
    draw.text((lx+52, 16), "FK", fill=GRAY, font=fm_xs)
    draw.text((lx+80, 16), "\u2014 Relation", fill=GRAY, font=fm_xs)

    tables = {
        "users": [("id", "PK"), ("name", ""), ("email", ""), ("plan_id", "FK")],
        "orders": [("id", "PK"), ("user_id", "FK"), ("total", ""), ("created_at", "")],
        "products": [("id", "PK"), ("name", ""), ("price", ""), ("category", "")],
        "order_items": [("id", "PK"), ("order_id", "FK"), ("product_id", "FK"), ("qty", "")],
        "plans": [("id", "PK"), ("name", ""), ("price", ""), ("interval", "")],
    }

    # Draw relationships first (behind tables)
    positions = {}
    for name, (x, y) in table_positions.items():
        cols = tables[name]
        w, row_h = 160, 18
        h = 30 + len(cols) * row_h + 6
        positions[name] = (x, y, w, h)

    # Relationships
    rels = [("orders", "users"), ("order_items", "orders"), ("order_items", "products"), ("users", "plans")]
    for t1, t2 in rels:
        if t1 in positions and t2 in positions:
            x1,y1,w1,h1 = positions[t1]
            x2,y2,w2,h2 = positions[t2]
            draw_relationship(draw, x1, y1, w1, h1, x2, y2, w2, h2)

    # Draw tables
    for name, (x, y) in table_positions.items():
        hl = (name == drag_highlight)
        draw_er_table(draw, x, y, name, tables[name], highlight=hl)

    # Drag cursor indicator
    if dragging:
        dx, dy = dragging
        draw.ellipse((dx-6, dy-6, dx+6, dy+6), fill=INDIGO, outline=WHITE, width=2)

    return img

def generate_er_gif():
    frames, durs = [], []

    # Initial positions
    pos = {
        "users": (100, 80),
        "orders": (320, 80),
        "products": (540, 80),
        "order_items": (320, 290),
        "plans": (100, 290),
    }

    # Scene 1: Show full diagram
    frames.append(frame_er_diagram(pos)); durs.append(2500)

    # Scene 2: Highlight order_items
    frames.append(frame_er_diagram(pos, drag_highlight="order_items")); durs.append(800)

    # Scene 3: Drag order_items from (320,290) to (540,280) - smooth animation
    start_x, start_y = 320, 290
    end_x, end_y = 540, 260
    steps = 18
    for i in range(steps + 1):
        t = i / steps
        # Ease in-out
        t = t * t * (3 - 2 * t)
        cx = int(start_x + (end_x - start_x) * t)
        cy = int(start_y + (end_y - start_y) * t)
        p = dict(pos)
        p["order_items"] = (cx, cy)
        cursor = (cx + 80, cy + 50)
        frames.append(frame_er_diagram(p, dragging=cursor, drag_highlight="order_items"))
        durs.append(60)

    # Scene 4: Dropped - new position
    pos2 = dict(pos)
    pos2["order_items"] = (540, 260)
    frames.append(frame_er_diagram(pos2)); durs.append(1500)

    # Scene 5: Drag users table
    frames.append(frame_er_diagram(pos2, drag_highlight="users")); durs.append(600)

    start_x, start_y = 100, 80
    end_x, end_y = 80, 180
    for i in range(steps + 1):
        t = i / steps
        t = t * t * (3 - 2 * t)
        cx = int(start_x + (end_x - start_x) * t)
        cy = int(start_y + (end_y - start_y) * t)
        p = dict(pos2)
        p["users"] = (cx, cy)
        cursor = (cx + 80, cy + 40)
        frames.append(frame_er_diagram(p, dragging=cursor, drag_highlight="users"))
        durs.append(60)

    # Scene 6: Final layout
    pos3 = dict(pos2)
    pos3["users"] = (80, 180)
    frames.append(frame_er_diagram(pos3)); durs.append(3000)

    return frames, durs


# ═══════════════════════════════════════════════════════════
# GIF 4: Billing
# ═══════════════════════════════════════════════════════════

def draw_plan_card(draw, x, y, w, h, name, price, period, features, active=False, featured=False, hovering=False):
    border = INDIGO if featured or hovering else BORDER
    bg = (25, 30, 50) if featured else CARD_BG
    rr(draw, (x, y, x+w, y+h), bg, r=14, outline=border)

    if featured:
        rr(draw, (x+w-90, y+8, x+w-10, y+28), INDIGO, r=6)
        draw.text((x+w-82, y+11), "Popular", fill=WHITE, font=fu_xs)

    if active:
        rr(draw, (x+10, y+8, x+80, y+28), GREEN_DARK, r=6)
        draw.text((x+18, y+11), "Current", fill=GREEN, font=fu_xs)

    draw.text((x+20, y+40), name, fill=WHITE, font=fb_lg)
    draw.text((x+20, y+70), price, fill=WHITE, font=fb_xl)
    draw.text((x+20 + draw.textlength(price, font=fb_xl) + 4, y+80), period, fill=GRAY, font=fu_sm)

    for i, feat in enumerate(features):
        fy = y + 110 + i * 22
        draw.text((x+20, fy), "\u2713", fill=GREEN, font=fu_sm)
        draw.text((x+38, fy), feat, fill=GRAY, font=fu_sm)

    # Button
    btn_y = y + h - 45
    if active:
        rr(draw, (x+15, btn_y, x+w-15, btn_y+32), DARK_GRAY, r=8)
        tw = draw.textlength("Current Plan", font=fb_sm)
        draw.text((x+15+(w-30-tw)/2, btn_y+8), "Current Plan", fill=GRAY, font=fb_sm)
    elif hovering:
        btn(draw, (x+15, btn_y, x+w-15, btn_y+32), "Upgrade Now", fill=PURPLE)
    else:
        btn(draw, (x+15, btn_y, x+w-15, btn_y+32), "Choose Plan")

def frame_billing(active_plan="Free", hover_plan=None):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_sidebar(draw, "billing")
    draw_header(draw, "Plans & Billing", "Choose the plan that fits your team")

    plans = [
        ("Free", "$0", "/forever", ["5 queries/day", "PostgreSQL only", "CSV export"], False),
        ("Pro", "$29", "/month", ["Unlimited queries", "All 4 databases", "Auto-charts + export", "PII masking"], True),
        ("Enterprise", "Custom", "", ["Everything in Pro", "SSO & RBAC", "Dedicated support", "Custom integrations"], False),
    ]

    cw = 220
    gap = 16
    total = len(plans) * cw + (len(plans)-1) * gap
    sx = 70 + (W - 70 - total) // 2

    for i, (name, price, period, feats, feat_flag) in enumerate(plans):
        x = sx + i * (cw + gap)
        ch = 320
        is_active = name == active_plan
        is_hover = name == hover_plan
        draw_plan_card(draw, x, 80, cw, ch, name, price, period, feats,
                      active=is_active, featured=feat_flag, hovering=is_hover)

    # Payment methods at bottom
    draw.text((sx, H-50), "Secure payment via", fill=DARK_GRAY, font=fu_xs)
    # Stripe logo placeholder
    rr(draw, (sx+120, H-54, sx+180, H-36), (99, 91, 255), r=4)
    draw.text((sx+128, H-52), "Stripe", fill=WHITE, font=fb_xs)

    return img

def generate_billing_gif():
    frames, durs = [], []

    # Scene 1: Current plan (Free)
    frames.append(frame_billing("Free")); durs.append(2500)

    # Scene 2: Hover Pro
    frames.append(frame_billing("Free", "Pro")); durs.append(2000)

    # Scene 3: Hover Enterprise
    frames.append(frame_billing("Free", "Enterprise")); durs.append(2000)

    # Scene 4: Back to Pro hover
    frames.append(frame_billing("Free", "Pro")); durs.append(1500)

    # Scene 5: "Upgraded" to Pro
    frames.append(frame_billing("Pro")); durs.append(3000)

    return frames, durs


# ═══════════════════════════════════════════════════════════
# Generate all GIFs
# ═══════════════════════════════════════════════════════════

output_dir = os.path.dirname(__file__)

gifs = [
    ("demo_multidb.gif", generate_multidb_gif),
    ("demo_switching.gif", generate_switching_gif),
    ("demo_er.gif", generate_er_gif),
    ("demo_billing.gif", generate_billing_gif),
]

for filename, gen_func in gifs:
    frames, durs = gen_func()
    path = os.path.join(output_dir, filename)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=durs, loop=0, optimize=True)
    size_kb = os.path.getsize(path) / 1024
    print(f"{filename}: {len(frames)} frames, {sum(durs)/1000:.1f}s, {size_kb:.0f}KB")

print("\nAll GIFs generated!")
