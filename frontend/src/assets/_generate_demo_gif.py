"""
Generate an animated GIF showing the QueryCopilot demo flow:
  1. Login screen
  2. Dashboard / DB connection
  3. Typing a natural language query
  4. SQL generation
  5. Results + chart
"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 800, 500
BG = (13, 13, 13)          # #0d0d0d
CARD_BG = (17, 24, 39)     # gray-900
BORDER = (31, 41, 55)      # gray-800
INDIGO = (99, 102, 241)    # indigo-500
GREEN = (52, 211, 153)     # green-400
CYAN = (34, 211, 238)      # cyan-400
YELLOW = (253, 224, 71)    # yellow-300
RED = (248, 113, 113)      # red-400
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)     # gray-400
DARK_GRAY = (75, 85, 99)   # gray-600
PURPLE = (139, 92, 246)    # violet-500

# Try to get a good monospace font
def get_font(size):
    font_paths = [
        "C:/Windows/Fonts/consola.ttf",     # Consolas
        "C:/Windows/Fonts/cour.ttf",         # Courier New
        "C:/Windows/Fonts/lucon.ttf",        # Lucida Console
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()

def get_ui_font(size):
    font_paths = [
        "C:/Windows/Fonts/segoeui.ttf",     # Segoe UI
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()

def get_bold_font(size):
    font_paths = [
        "C:/Windows/Fonts/segoeuib.ttf",    # Segoe UI Bold
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return get_ui_font(size)

font_mono = get_font(14)
font_mono_sm = get_font(12)
font_ui = get_ui_font(14)
font_ui_sm = get_ui_font(12)
font_ui_lg = get_ui_font(18)
font_bold = get_bold_font(16)
font_bold_lg = get_bold_font(22)
font_bold_sm = get_bold_font(14)
font_bold_xl = get_bold_font(28)


def rounded_rect(draw, xy, fill, radius=12, outline=None):
    """Draw a rounded rectangle."""
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def draw_terminal_header(draw, x, y, w, title="QueryCopilot"):
    """Draw macOS-style terminal header."""
    rounded_rect(draw, (x, y, x+w, y+36), CARD_BG, radius=0, outline=BORDER)
    # Traffic lights
    draw.ellipse((x+12, y+12, x+24, y+24), fill=(239, 68, 68))
    draw.ellipse((x+32, y+12, x+44, y+24), fill=(234, 179, 8))
    draw.ellipse((x+52, y+12, x+64, y+24), fill=(34, 197, 94))
    draw.text((x+80, y+10), title, fill=DARK_GRAY, font=font_mono_sm)


def draw_cursor(draw, x, y, color=WHITE):
    """Draw a blinking cursor."""
    draw.rectangle((x, y, x+2, y+16), fill=color)


def draw_button(draw, xy, text, fill=INDIGO, text_color=WHITE):
    """Draw a button."""
    x1, y1, x2, y2 = xy
    rounded_rect(draw, xy, fill, radius=8)
    tw = draw.textlength(text, font=font_bold_sm)
    tx = x1 + (x2 - x1 - tw) / 2
    ty = y1 + (y2 - y1 - 16) / 2
    draw.text((tx, ty), text, fill=text_color, font=font_bold_sm)


def draw_input_field(draw, xy, label, value="", placeholder="", is_password=False, active=False):
    """Draw a form input field."""
    x1, y1, x2, y2 = xy
    draw.text((x1, y1 - 20), label, fill=GRAY, font=font_ui_sm)
    border = INDIGO if active else BORDER
    rounded_rect(draw, xy, (31, 41, 55), radius=8, outline=border)
    display = value if not is_password else "\u2022" * len(value)
    if display:
        draw.text((x1 + 12, y1 + 10), display, fill=WHITE, font=font_ui)
    elif placeholder:
        draw.text((x1 + 12, y1 + 10), placeholder, fill=DARK_GRAY, font=font_ui)


# ─── Frame generators ───────────────────────────────────────

def frame_login_empty():
    """Login screen - empty form."""
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Card background
    cx, cy = 200, 60
    cw, ch = 400, 380
    rounded_rect(draw, (cx, cy, cx+cw, cy+ch), CARD_BG, radius=16, outline=BORDER)

    # Logo
    draw.text((cx+100, cy+25), "Query", fill=WHITE, font=font_bold_xl)
    draw.text((cx+210, cy+25), "Copilot", fill=INDIGO, font=font_bold_xl)

    # Subtitle
    draw.text((cx+120, cy+60), "Ask your data anything", fill=GRAY, font=font_ui_sm)

    # Title
    draw.text((cx+160, cy+95), "Sign In", fill=WHITE, font=font_bold)

    # Email field
    draw_input_field(draw, (cx+30, cy+140, cx+cw-30, cy+180), "Email",
                     placeholder="you@example.com")

    # Password field
    draw_input_field(draw, (cx+30, cy+220, cx+cw-30, cy+260), "Password",
                     placeholder="Enter your password", is_password=True)

    # Sign In button
    draw_button(draw, (cx+30, cy+290, cx+cw-30, cy+330), "Sign In")

    # Register link
    draw.text((cx+90, cy+345), "Don't have an account? ", fill=DARK_GRAY, font=font_ui_sm)
    draw.text((cx+260, cy+345), "Register", fill=INDIGO, font=font_ui_sm)

    return img


def frame_login_typing(email_chars=0, pwd_chars=0):
    """Login screen - typing credentials."""
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    cx, cy = 200, 60
    cw, ch = 400, 380
    rounded_rect(draw, (cx, cy, cx+cw, cy+ch), CARD_BG, radius=16, outline=BORDER)

    draw.text((cx+100, cy+25), "Query", fill=WHITE, font=font_bold_xl)
    draw.text((cx+210, cy+25), "Copilot", fill=INDIGO, font=font_bold_xl)
    draw.text((cx+120, cy+60), "Ask your data anything", fill=GRAY, font=font_ui_sm)
    draw.text((cx+160, cy+95), "Sign In", fill=WHITE, font=font_bold)

    email = "alex@company.com"[:email_chars]
    pwd = "securepass"[:pwd_chars]

    draw_input_field(draw, (cx+30, cy+140, cx+cw-30, cy+180), "Email",
                     value=email, active=pwd_chars == 0 and email_chars > 0)
    draw_input_field(draw, (cx+30, cy+220, cx+cw-30, cy+260), "Password",
                     value=pwd, is_password=True, active=pwd_chars > 0)

    draw_button(draw, (cx+30, cy+290, cx+cw-30, cy+330), "Sign In")
    draw.text((cx+90, cy+345), "Don't have an account? ", fill=DARK_GRAY, font=font_ui_sm)
    draw.text((cx+260, cy+345), "Register", fill=INDIGO, font=font_ui_sm)

    return img


def frame_login_signing_in():
    """Login screen - signing in with spinner."""
    img = frame_login_typing(16, 10)
    draw = ImageDraw.Draw(img)
    cx, cy = 200, 60
    cw = 400
    # Overwrite button with "Signing in..."
    rounded_rect(draw, (cx+30, cy+290, cx+cw-30, cy+330), (67, 56, 202), radius=8)
    tw = draw.textlength("Signing in...", font=font_bold_sm)
    draw.text((cx + cw/2 - tw/2, cy+300), "Signing in...", fill=WHITE, font=font_bold_sm)
    return img


def frame_dashboard_empty():
    """Dashboard - initial view with sidebar."""
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Sidebar
    sw = 200
    rounded_rect(draw, (0, 0, sw, H), CARD_BG, radius=0, outline=BORDER)

    # Logo in sidebar
    draw.text((20, 20), "Query", fill=WHITE, font=font_bold)
    draw.text((88, 20), "Copilot", fill=INDIGO, font=font_bold)

    # Sidebar items
    items = [("+ New Chat", INDIGO), ("Chat History", GRAY)]
    for i, (text, color) in enumerate(items):
        y = 70 + i * 40
        if i == 0:
            rounded_rect(draw, (12, y, sw-12, y+32), (67, 56, 202, 80), radius=8)
        draw.text((24, y+8), text, fill=color, font=font_ui_sm)

    # User info at bottom
    draw.ellipse((16, H-44, 40, H-20), fill=INDIGO)
    draw.text((26, H-38), "A", fill=WHITE, font=font_bold_sm)
    draw.text((48, H-40), "Alex Johnson", fill=WHITE, font=font_ui_sm)

    # Main area header
    draw.text((sw+30, 20), "Welcome back, Alex!", fill=WHITE, font=font_bold_lg)
    draw.text((sw+30, 50), "Ask a question about your data below", fill=GRAY, font=font_ui_sm)

    # DB connection indicator
    rounded_rect(draw, (sw+30, 80, sw+220, 110), (6, 78, 59), radius=8, outline=(16, 185, 129))
    draw.ellipse((sw+40, 88, sw+52, 100), fill=GREEN)
    draw.text((sw+58, 87), "PostgreSQL Connected", fill=GREEN, font=font_ui_sm)

    # Query input area
    qy = 140
    rounded_rect(draw, (sw+20, qy, W-20, qy+80), CARD_BG, radius=12, outline=BORDER)
    draw.text((sw+36, qy+12), "Ask a question about your data...", fill=DARK_GRAY, font=font_ui)

    # Send button
    bx = W - 60
    draw.ellipse((bx, qy+20, bx+40, qy+60), fill=INDIGO)
    # Arrow icon
    draw.polygon([(bx+14, qy+40), (bx+26, qy+32), (bx+26, qy+48)], fill=WHITE)

    return img


def frame_dashboard_typing(chars=0):
    """Dashboard - typing a query."""
    img = frame_dashboard_empty()
    draw = ImageDraw.Draw(img)

    sw = 200
    qy = 140
    query = "What were my top 5 products by revenue last month?"[:chars]

    # Redraw query box with text
    rounded_rect(draw, (sw+20, qy, W-20, qy+80), CARD_BG, radius=12, outline=INDIGO)
    draw.text((sw+36, qy+12), query, fill=YELLOW, font=font_ui)

    if chars < 50:
        # Draw cursor
        cursor_x = sw + 36 + draw.textlength(query, font=font_ui)
        draw_cursor(draw, cursor_x, qy+12, YELLOW)

    return img


def frame_generating_sql():
    """Dashboard - generating SQL with loading indicator."""
    img = frame_dashboard_typing(50)
    draw = ImageDraw.Draw(img)

    sw = 200
    ry = 240

    # Response area
    rounded_rect(draw, (sw+20, ry, W-20, ry+240), CARD_BG, radius=12, outline=BORDER)

    # AI avatar + "Generating..."
    draw.ellipse((sw+32, ry+12, sw+52, ry+32), fill=PURPLE)
    draw.text((sw+38, ry+15), "AI", fill=WHITE, font=font_mono_sm)
    draw.text((sw+60, ry+14), "QueryCopilot", fill=WHITE, font=font_bold_sm)

    # Loading animation
    draw.text((sw+40, ry+50), "Analyzing your question...", fill=GRAY, font=font_ui_sm)

    # Shimmer bars
    for i in range(3):
        bar_w = [350, 280, 200][i]
        bar_y = ry + 80 + i * 25
        rounded_rect(draw, (sw+40, bar_y, sw+40+bar_w, bar_y+14), (31, 41, 55), radius=4)
        # Shimmer highlight
        sx = sw + 40 + (i * 60)
        rounded_rect(draw, (sx, bar_y, sx+80, bar_y+14), (55, 65, 81), radius=4)

    return img


def frame_sql_result():
    """Dashboard - SQL generated."""
    img = frame_dashboard_typing(50)
    draw = ImageDraw.Draw(img)

    sw = 200
    ry = 240

    # Response area
    rounded_rect(draw, (sw+20, ry, W-20, ry+240), CARD_BG, radius=12, outline=BORDER)

    # AI avatar
    draw.ellipse((sw+32, ry+12, sw+52, ry+32), fill=PURPLE)
    draw.text((sw+38, ry+15), "AI", fill=WHITE, font=font_mono_sm)
    draw.text((sw+60, ry+14), "QueryCopilot", fill=WHITE, font=font_bold_sm)
    draw.text((sw+170, ry+16), "184ms", fill=DARK_GRAY, font=font_mono_sm)

    # SQL code block
    sql_y = ry + 42
    rounded_rect(draw, (sw+32, sql_y, W-32, sql_y+90), (6, 6, 6), radius=8, outline=(55, 65, 81))
    draw.text((sw+40, sql_y+4), "SQL", fill=INDIGO, font=font_mono_sm)

    sql_lines = [
        ("SELECT", CYAN, " p.name, ", WHITE, "SUM", CYAN, "(oi.revenue) ", WHITE, "AS", CYAN, " revenue", WHITE),
        ("FROM", CYAN, " orders o ", WHITE, "JOIN", CYAN, " order_items oi", WHITE),
        ("  ", WHITE, "ON", CYAN, " o.id = oi.order_id", WHITE),
        ("WHERE", CYAN, " o.created_at >= ", WHITE, "DATE_TRUNC", CYAN, "('month')", WHITE),
        ("GROUP BY", CYAN, " p.name ", WHITE, "ORDER BY", CYAN, " revenue ", WHITE, "DESC", CYAN, " LIMIT 5", WHITE),
    ]

    for i, parts in enumerate(sql_lines):
        x = sw + 44
        for j in range(0, len(parts), 2):
            text = parts[j]
            color = parts[j+1]
            draw.text((x, sql_y + 20 + i * 14), text, fill=color, font=font_mono_sm)
            x += draw.textlength(text, font=font_mono_sm)

    return img


def frame_full_results():
    """Dashboard - full results with table."""
    img = frame_sql_result()
    draw = ImageDraw.Draw(img)

    sw = 200
    ty = 390

    # Results table
    rounded_rect(draw, (sw+32, ty, W-32, ty+100), (6, 6, 6), radius=8, outline=(55, 65, 81))

    # Table header
    draw.text((sw+44, ty+6), "Product", fill=INDIGO, font=font_bold_sm)
    draw.text((W-170, ty+6), "Revenue", fill=INDIGO, font=font_bold_sm)
    draw.line((sw+40, ty+24, W-40, ty+24), fill=BORDER, width=1)

    # Table rows
    rows = [
        ("Pro Analytics", "$142,890", 1.0),
        ("Data Starter", "$98,340", 0.69),
        ("Enterprise Suite", "$76,210", 0.53),
        ("Team Bundle", "$54,120", 0.38),
        ("API Access", "$31,450", 0.22),
    ]

    for i, (name, rev, pct) in enumerate(rows):
        ry = ty + 30 + i * 15
        draw.text((sw+44, ry), name, fill=WHITE, font=font_mono_sm)
        draw.text((W-170, ry), rev, fill=GREEN, font=font_mono_sm)
        # Mini bar
        bar_x = W - 100
        bar_w = int(50 * pct)
        rounded_rect(draw, (bar_x, ry+2, bar_x+bar_w, ry+10), INDIGO, radius=3)

    # Status bar
    draw.text((sw+44, ty+108), "5 rows", fill=DARK_GRAY, font=font_mono_sm)
    draw.text((sw+110, ty+108), "\u00b7", fill=DARK_GRAY, font=font_mono_sm)
    draw.text((sw+122, ty+108), "184ms", fill=DARK_GRAY, font=font_mono_sm)
    draw.text((sw+188, ty+108), "\u00b7", fill=DARK_GRAY, font=font_mono_sm)
    draw.text((sw+200, ty+108), "claude-haiku", fill=DARK_GRAY, font=font_mono_sm)

    return img


# ─── Build the GIF ─────────────────────────────────────────

frames = []
durations = []

# Scene 1: Login empty (hold 1.2s)
frames.append(frame_login_empty())
durations.append(1200)

# Scene 2: Typing email (character by character)
email = "alex@company.com"
for i in range(1, len(email) + 1):
    frames.append(frame_login_typing(i, 0))
    durations.append(70)

# Pause after email
frames.append(frame_login_typing(len(email), 0))
durations.append(400)

# Scene 3: Typing password
pwd = "securepass"
for i in range(1, len(pwd) + 1):
    frames.append(frame_login_typing(len(email), i))
    durations.append(80)

# Pause after password
frames.append(frame_login_typing(len(email), len(pwd)))
durations.append(500)

# Scene 4: Signing in (hold 1.5s)
frames.append(frame_login_signing_in())
durations.append(1500)

# Scene 5: Dashboard empty (hold 1.5s)
frames.append(frame_dashboard_empty())
durations.append(1500)

# Scene 6: Typing query
query = "What were my top 5 products by revenue last month?"
for i in range(1, len(query) + 1):
    frames.append(frame_dashboard_typing(i))
    durations.append(50)

# Pause after query
frames.append(frame_dashboard_typing(len(query)))
durations.append(600)

# Scene 7: Generating SQL (hold 1.8s)
frames.append(frame_generating_sql())
durations.append(1800)

# Scene 8: SQL result (hold 1.5s)
frames.append(frame_sql_result())
durations.append(1500)

# Scene 9: Full results with table (hold 3s)
frames.append(frame_full_results())
durations.append(3000)

# Scene 10: Hold final frame extra before loop
frames.append(frame_full_results())
durations.append(2000)

# Save GIF
output_path = os.path.join(os.path.dirname(__file__), "demo.gif")
frames[0].save(
    output_path,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=True,
)

print(f"GIF saved to {output_path}")
print(f"Total frames: {len(frames)}")
total_ms = sum(durations)
print(f"Total duration: {total_ms}ms ({total_ms/1000:.1f}s)")
print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")
