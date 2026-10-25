import streamlit as st
import sqlite3
import os
import json
from datetime import datetime

st.set_page_config(
    page_title="Your friend LXNORO",
    page_icon="⏱️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Futuristic Dark Theme Styling (LXNORO Identity - Zero White Backgrounds)
st.markdown("""
<style>
    .stApp {
        background-color: #060810;
        color: #f8fafc;
        font-family: system-ui, -apple-system, sans-serif;
    }
    header[data-testid="stHeader"] {
        background: transparent;
    }
    .main-header {
        font-size: 2.25rem;
        font-weight: 800;
        background: linear-gradient(135deg, #f8fafc 0%, #b381ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
    }
    .live-clock-card {
        background: rgba(18, 24, 38, 0.9);
        border: 1px solid rgba(168, 85, 247, 0.3);
        border-radius: 12px;
        padding: 0.75rem 1.25rem;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .horizon-frame {
        background: rgba(14, 18, 28, 0.9);
        border: 1px solid rgba(168, 85, 247, 0.25);
        border-radius: 14px;
        padding: 1rem;
        margin: 1rem 0;
    }
    .horizon-card {
        background: rgba(18, 24, 38, 0.85);
        border: 1px solid rgba(168, 85, 247, 0.25);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
        padding: 1rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 0.75rem;
    }
    .element-card {
        background: rgba(18, 24, 38, 0.9);
        border: 1px solid rgba(168, 85, 247, 0.2);
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
        height: 100%;
        transition: all 0.2s ease;
    }
    .element-card:hover {
        border-color: rgba(168, 85, 247, 0.6);
        box-shadow: 0 0 15px rgba(168, 85, 247, 0.2);
    }
    .stButton>button {
        background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
        color: white;
        border-radius: 8px;
        border: none;
        font-weight: 600;
        padding: 0.4rem 0.9rem;
        box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);
    }
    .stButton>button:hover {
        background: linear-gradient(135deg, #9333ea 0%, #6d28d9 100%);
    }
    input, textarea, select {
        background-color: #171321 !important;
        color: #d8b4fe !important;
        border: 1px solid rgba(191,151,255,0.3) !important;
        border-radius: 8px !important;
    }
    input:focus, textarea:focus, select:focus {
        border-color: #b381ff !important;
        box-shadow: 0 0 10px rgba(179,129,255,0.3) !important;
    }
    .badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        background: rgba(168, 85, 247, 0.15);
        color: #d8b4fe;
        border: 1px solid rgba(168, 85, 247, 0.3);
    }
</style>
""", unsafe_allow_html=True)

# SQLite Database Setup
DB_PATH = ".data/streamlit_demo.sqlite"
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS demo_activities (
            id TEXT PRIMARY KEY,
            horizon TEXT NOT NULL,
            symbol TEXT NOT NULL,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            duration INTEGER NOT NULL,
            notes TEXT
        )
    """)
    cursor.execute("SELECT COUNT(*) FROM demo_activities")
    if cursor.fetchone()[0] == 0:
        today = datetime.now().strftime("%Y-%m-%d")
        defaults = [
            ("1", "day", "☕", "Morning Routine & Coffee", today, "08:00", 45, "Quiet coffee, journal, and daily intention setting."),
            ("2", "day", "💻", "Deep Work / Study Sprint", today, "09:30", 120, "Focused coding and core project architecture sprint."),
            ("3", "day", "🥗", "Healthy Lunch & Walk", today, "12:30", 60, "Break away from screens, light walk outside."),
            ("4", "day", "🍳", "Dinner with Family", today, "19:00", 60, "Cook and enjoy dinner together."),
            ("5", "week", "🗓️", "Weekly Planning & Review", today, "10:00", 60, "Review goals, backlog, and priorities for the week."),
            ("6", "month", "🎯", "Monthly Milestone Check", today, "14:00", 90, "Assess progress on major project milestones and deliverables."),
            ("7", "year", "🌟", "Annual Vision & Core Goals", today, "09:00", 120, "Set core focus areas and metrics for the year."),
            ("8", "fiveYears", "🚀", "Five-Year Horizon Plan", today, "10:00", 180, "Long-term personal and professional trajectory map.")
        ]
        cursor.executemany("INSERT OR REPLACE INTO demo_activities VALUES (?, ?, ?, ?, ?, ?, ?, ?)", defaults)
        conn.commit()
    conn.close()

init_db()

# Top Header & Live Clock
col_head_title, col_head_clock = st.columns([2, 1])
with col_head_title:
    st.markdown('<h1 class="main-header">Your friend LXNORO</h1>', unsafe_allow_html=True)
    st.markdown('<p style="color: #94a3b8; font-size: 0.95rem; margin: 0;">Futuristic Personal Time Engine & Planning Matrix</p>', unsafe_allow_html=True)
with col_head_clock:
    now_str = datetime.now().strftime("%A, %B %d, %Y — %H:%M:%S")
    st.markdown(f'''
    <div class="live-clock-card">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399;"></span>
        <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Device Local Time</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; font-variant-numeric: tabular-nums;">{now_str}</div>
        </div>
    </div>
    ''', unsafe_allow_html=True)

st.markdown("<div style='margin-top: 1.5rem;'></div>", unsafe_allow_html=True)

# Planning Horizon Selector in Framed Panel
st.markdown('<div class="horizon-frame">', unsafe_allow_html=True)
st.markdown("### 🔭 Planning Horizons", unsafe_allow_html=True)

horizons = {
    "day": "📅 Daily",
    "week": "📆 Weekly",
    "month": "🗓️ Monthly",
    "year": "📈 Yearly",
    "fiveYears": "🌟 Five-Year"
}

cols_hz = st.columns(5)
selected_horizon = st.session_state.get("selected_horizon", "day")

for i, (hz_key, hz_label) in enumerate(horizons.items()):
    with cols_hz[i]:
        is_active = (selected_horizon == hz_key)
        btn_type = "primary" if is_active else "secondary"
        if st.button(hz_label, key=f"hz_btn_{hz_key}", use_container_width=True):
            st.session_state["selected_horizon"] = hz_key
            selected_horizon = hz_key
            st.rerun()

st.markdown('</div>', unsafe_allow_html=True)

# Fetch activities for selected horizon
conn = get_db()
cursor = conn.cursor()
cursor.execute("SELECT * FROM demo_activities WHERE horizon = ? ORDER BY date, time", (selected_horizon,))
rows = cursor.fetchall()
conn.close()

# Scheduled Tasks Panel (Upper part of main page)
st.markdown(f"### 📋 Scheduled Tasks & Activities: {horizons[selected_horizon]}")

if not rows:
    st.info("No tasks scheduled for this horizon yet. Use the activity grid below or create a new item to schedule your time.")
else:
    for row in rows:
        st.markdown(f"""
        <div class="horizon-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <div>
                    <span style="font-size: 1.25rem; margin-right: 0.5rem;">{row['symbol']}</span>
                    <strong style="font-size: 1.1rem; color: #f8fafc;">{row['title']}</strong>
                </div>
                <div>
                    <span class="badge">🕒 {row['time']} ({row['duration']}m)</span>
                    <span class="badge" style="margin-left: 0.4rem;">📅 {row['date']}</span>
                </div>
            </div>
            <p style="color: #94a3b8; font-size: 0.9rem; margin: 0; white-space: pre-wrap;">{row['notes'] or 'No notes provided.'}</p>
        </div>
        """, unsafe_allow_html=True)
        
        col_e, col_d, col_s = st.columns([1, 1, 4])
        with col_e:
            edit_flag = f"edit_active_{row['id']}"
            if st.button("✏️ Edit", key=f"btn_ed_{row['id']}"):
                st.session_state[edit_flag] = not st.session_state.get(edit_flag, False)
                st.rerun()
        with col_d:
            del_flag = f"del_confirm_{row['id']}"
            if st.button("🗑️ Delete", key=f"btn_dl_{row['id']}"):
                st.session_state[del_flag] = True
                st.rerun()

        # Deletion confirmation
        if st.session_state.get(f"del_confirm_{row['id']}", False):
            st.warning(f"Delete '{row['title']}'?")
            c_y, c_n = st.columns(2)
            with c_y:
                if st.button("Confirm Delete", key=f"yes_dl_{row['id']}"):
                    c = get_db()
                    c.execute("DELETE FROM demo_activities WHERE id = ?", (row['id'],))
                    c.commit()
                    c.close()
                    st.session_state[f"del_confirm_{row['id']}"] = False
                    st.success("Deleted successfully!")
                    st.rerun()
            with c_n:
                if st.button("Cancel", key=f"no_dl_{row['id']}"):
                    st.session_state[f"del_confirm_{row['id']}"] = False
                    st.rerun()

        # Inline Edit Form
        if st.session_state.get(f"edit_active_{row['id']}", False):
            with st.form(key=f"edit_form_{row['id']}"):
                st.markdown(f"**Editing: {row['title']}**")
                n_sym = st.text_input("Symbol", value=row['symbol'], key=f"esym_{row['id']}")
                n_title = st.text_input("Title", value=row['title'], key=f"etitl_{row['id']}")
                nc1, nc2, nc3 = st.columns(3)
                try:
                    p_date = datetime.strptime(row['date'], "%Y-%m-%d").date()
                except:
                    p_date = datetime.now().date()
                with nc1:
                    n_date = st.date_input("Date", value=p_date, key=f"edate_{row['id']}")
                with nc2:
                    n_time = st.text_input("Time (HH:MM)", value=row['time'], key=f"etime_{row['id']}")
                with nc3:
                    n_dur = st.number_input("Duration (min)", min_value=5, max_value=1440, value=int(row['duration']), step=5, key=f"edur_{row['id']}")
                n_notes = st.text_area("Notes", value=row['notes'] or "", key=f"enotes_{row['id']}")
                
                if st.form_submit_button("Save Changes"):
                    # Duplicate validation on edit
                    c = get_db()
                    dup = c.execute(
                        "SELECT id FROM demo_activities WHERE horizon = ? AND date = ? AND time = ? AND title = ? AND id != ?",
                        (selected_horizon, n_date.strftime("%Y-%m-%d"), n_time.strip(), n_title.strip(), row['id'])
                    ).fetchone()
                    if dup:
                        st.error("Conflict: An identical activity is already scheduled at this exact date and time.")
                        c.close()
                    else:
                        c.execute(
                            "UPDATE demo_activities SET symbol = ?, title = ?, date = ?, time = ?, duration = ?, notes = ? WHERE id = ?",
                            (n_sym.strip() or "📌", n_title.strip() or "Untitled", n_date.strftime("%Y-%m-%d"), n_time.strip(), int(n_dur), n_notes.strip(), row['id'])
                        )
                        c.commit()
                        c.close()
                        st.session_state[f"edit_active_{row['id']}"] = False
                        st.success("Updated successfully!")
                        st.rerun()

st.markdown("<div style='margin-top: 2rem;'></div>", unsafe_allow_html=True)

# Activity/Element Cards Panel (Bottom part of page - 4 columns)
st.markdown("### ⚡ Activity & Element Grid (16 Quick Elements)")

# Define 16 starter elements
starter_elements = [
    ("☕", "Morning Routine", "day", "08:00", 45, "Coffee & intention setting"),
    ("💻", "Deep Work", "day", "09:30", 120, "Focused productivity sprint"),
    ("🥗", "Healthy Lunch", "day", "12:30", 60, "Midday break & nutrition"),
    ("🚶", "Afternoon Walk", "day", "16:00", 30, "Fresh air and stretching"),
    ("🍳", "Family Dinner", "day", "19:00", 60, "Cooking & dining together"),
    ("📚", "Reading", "day", "20:30", 45, "Book or article study"),
    ("🌙", "Wind Down", "day", "22:00", 30, "Screen-free relaxation"),
    ("🗓️", "Weekly Review", "week", "10:00", 60, "Backlog & priority sorting"),
    ("🎯", "Milestone Check", "month", "14:00", 90, "Progress assessment"),
    ("📈", "Yearly Goal Setting", "year", "09:00", 120, "Core annual metrics"),
    ("🚀", "5-Year Roadmap", "fiveYears", "10:00", 180, "Long-term vision mapping"),
    ("🧘", "Meditation", "day", "07:30", 20, "Mindfulness practice"),
    ("💧", "Hydration Break", "day", "11:00", 15, "Water and posture check"),
    ("✍️", "Journaling", "day", "21:30", 20, "Reflections of the day"),
    ("🧹", "Tidy Workspace", "day", "17:45", 15, "Clear desk for tomorrow"),
    ("🎨", "Creative Hobby", "week", "15:00", 120, "Art, music, or side project")
]

cols_grid = st.columns(4)
for idx, (sym, title, def_hz, def_time, def_dur, def_notes) in enumerate(starter_elements):
    col_target = cols_grid[idx % 4]
    with col_target:
        st.markdown(f"""
        <div class="element-card">
            <div style="font-size: 2rem; margin-bottom: 0.25rem;">{sym}</div>
            <div style="font-weight: 600; font-size: 0.95rem; color: #f8fafc; margin-bottom: 0.25rem;">{title}</div>
            <div style="font-size: 0.75rem; color: #94a3b8;">{def_hz.upper()} &bull; {def_time}</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Schedule", key=f"sched_elem_{idx}", use_container_width=True):
            # Quick schedule action
            new_id = str(datetime.now().timestamp() + idx)
            today_str = datetime.now().strftime("%Y-%m-%d")
            c = get_db()
            dup = c.execute(
                "SELECT id FROM demo_activities WHERE horizon = ? AND date = ? AND time = ? AND title = ?",
                (def_hz, today_str, def_time, title)
            ).fetchone()
            if dup:
                st.warning(f"'{title}' is already scheduled for today at {def_time}.")
            else:
                c.execute(
                    "INSERT INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (new_id, def_hz, sym, title, today_str, def_time, def_dur, def_notes)
                )
                c.commit()
                st.success(f"Scheduled '{title}'!")
                st.rerun()
            c.close()

st.markdown("<div style='margin-top: 2rem;'></div>", unsafe_allow_html=True)

# Add New Custom Activity / Backup Restore Section in Sidebar or Bottom
st.sidebar.markdown("### ➕ Schedule Custom Task")
with st.sidebar.form("sidebar_add_form"):
    s_sym = st.text_input("Symbol", value="⚡")
    s_title = st.text_input("Title", value="Quick Task")
    s_date = st.date_input("Date", value=datetime.now())
    s_time = st.text_input("Time (HH:MM)", value="15:00")
    s_dur = st.number_input("Duration (min)", value=30, step=5)
    s_notes = st.text_area("Notes", value="")
    
    if st.form_submit_button("Add to Active Horizon"):
        new_id = str(datetime.now().timestamp())
        c = get_db()
        dup = c.execute(
            "SELECT id FROM demo_activities WHERE horizon = ? AND date = ? AND time = ? AND title = ?",
            (selected_horizon, s_date.strftime("%Y-%m-%d"), s_time.strip(), s_title.strip())
        ).fetchone()
        if dup:
            st.sidebar.error("Conflict: Identical activity already scheduled at this date & time.")
            c.close()
        else:
            c.execute(
                "INSERT INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, selected_horizon, s_sym.strip() or "📌", s_title.strip() or "Untitled", s_date.strftime("%Y-%m-%d"), s_time.strip(), int(s_dur), s_notes.strip())
            )
            c.commit()
            c.close()
            st.sidebar.success("Added successfully!")
            st.rerun()

st.sidebar.markdown("---")
st.sidebar.markdown("### 💾 Backup & Restore")

# Export Backup
if st.sidebar.button("Export JSON Backup"):
    c = get_db()
    all_rows = [dict(row) for row in c.execute("SELECT * FROM demo_activities").fetchall()]
    c.close()
    backup_data = {
        "version": 1,
        "exportedAt": datetime.now().isoformat(),
        "activities": all_rows
    }
    json_str = json.dumps(backup_data, indent=2)
    st.sidebar.download_button(
        label="Download Backup File",
        data=json_str,
        file_name=f"lxnoro-demo-backup-{datetime.now().strftime('%Y-%m-%d')}.json",
        mime="application/json"
    )

# Import Backup
uploaded_file = st.sidebar.file_uploader("Restore JSON Backup", type=["json"])
if uploaded_file is not None:
    try:
        content = uploaded_file.read().decode("utf-8")
        parsed = json.loads(content)
        if "activities" not in parsed or not isinstance(parsed["activities"], list):
            raise ValueError("Invalid backup file structure.")
        
        if st.sidebar.button("Confirm & Overwrite Data"):
            c = get_db()
            c.execute("DELETE FROM demo_activities")
            for act in parsed["activities"]:
                c.execute(
                    "INSERT OR REPLACE INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (act.get("id"), act.get("horizon", "day"), act.get("symbol", "📌"), act.get("title", "Untitled"), act.get("date"), act.get("time", "12:00"), act.get("duration", 30), act.get("notes", ""))
                )
            c.commit()
            c.close()
            st.sidebar.success("Backup restored successfully!")
            st.rerun()
    except Exception as e:
        st.sidebar.error(f"Restore failed: {e}")

st.markdown("---")
st.markdown("<div style='text-align: center; color: #94a3b8; font-size: 0.85rem;'>Your friend LXNORO &bull; Futuristic Streamlit Community Cloud Demo</div>", unsafe_allow_html=True)
