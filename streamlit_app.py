import streamlit as st
import streamlit.components.v1 as components
import sqlite3
import os
import json
from datetime import datetime, timedelta

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
    .routine-badge {
        background: rgba(52, 211, 153, 0.15);
        color: #34d399;
        border: 1px solid rgba(52, 211, 153, 0.3);
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
            notes TEXT,
            is_routine INTEGER DEFAULT 0,
            recurrence_freq TEXT DEFAULT 'none'
        )
    """)
    try:
        cursor.execute("ALTER TABLE demo_activities ADD COLUMN is_routine INTEGER DEFAULT 0")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE demo_activities ADD COLUMN recurrence_freq TEXT DEFAULT 'none'")
    except:
        pass

    cursor.execute("SELECT COUNT(*) FROM demo_activities")
    if cursor.fetchone()[0] == 0:
        today = datetime.now().strftime("%Y-%m-%d")
        defaults = [
            ("1", "day", "☕", "Morning Routine & Coffee", today, "08:00", 45, "Quiet coffee, journal, and daily intention setting.", 1, "daily"),
            ("2", "day", "💻", "Deep Work / Study Sprint", today, "09:30", 120, "Focused coding and core project architecture sprint.", 0, "none"),
            ("3", "day", "🥗", "Healthy Lunch & Walk", today, "12:30", 60, "Break away from screens, light walk outside.", 1, "daily"),
            ("4", "day", "🍳", "Dinner with Family", today, "19:00", 60, "Cook and enjoy dinner together.", 1, "daily"),
            ("5", "week", "🗓️", "Weekly Planning & Review", today, "10:00", 60, "Review goals, backlog, and priorities for the week.", 1, "weekly"),
            ("6", "month", "🎯", "Monthly Milestone Check", today, "14:00", 90, "Assess progress on major project milestones and deliverables.", 1, "monthly"),
            ("7", "year", "🌟", "Annual Vision & Core Goals", today, "09:00", 120, "Set core focus areas and metrics for the year.", 1, "yearly"),
            ("8", "fiveYears", "🚀", "Five-Year Horizon Plan", today, "10:00", 180, "Long-term personal and professional trajectory map.", 0, "none")
        ]
        cursor.executemany("INSERT OR REPLACE INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes, is_routine, recurrence_freq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", defaults)
        conn.commit()
    conn.close()

init_db()

# Top Header & Live Clock (Top-right clock using browser local time via components.html)
col_head_title, col_head_clock = st.columns([2, 1])
with col_head_title:
    st.markdown('<h1 class="main-header">Your friend LXNORO</h1>', unsafe_allow_html=True)
    st.markdown('<p style="color: #94a3b8; font-size: 0.95rem; margin: 0;">Futuristic Personal Time Engine & Planning Matrix</p>', unsafe_allow_html=True)
with col_head_clock:
    clock_html = """
    <div class="live-clock-card" style="background: rgba(18, 24, 38, 0.9); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px; padding: 0.75rem 1.25rem; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: system-ui, -apple-system, sans-serif;">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399; flex-shrink: 0;"></span>
        <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Device Local Time</div>
            <div id="top-right-live-clock" style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; font-variant-numeric: tabular-nums;">Loading...</div>
        </div>
    </div>
    <script>
      function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        document.getElementById('top-right-live-clock').innerText = timeStr;
      }
      updateClock();
      setInterval(updateClock, 1000);
    </script>
    """
    components.html(clock_html, height=65, scrolling=False)

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
        if st.button(hz_label, key=f"hz_btn_{hz_key}", use_container_width=True):
            st.session_state["selected_horizon"] = hz_key
            selected_horizon = hz_key
            st.rerun()

st.markdown('</div>', unsafe_allow_html=True)

# Fetch activities for selected horizon in chronological order (date ASC, time ASC)
conn = get_db()
cursor = conn.cursor()
cursor.execute("SELECT * FROM demo_activities WHERE horizon = ? ORDER BY date ASC, time ASC", (selected_horizon,))
rows = cursor.fetchall()
conn.close()

# Filter out expired one-time activities (keep routines regardless of date)
now_dt = datetime.now()
valid_rows = []
for row in rows:
    is_routine = row["is_routine"] if "is_routine" in row.keys() else 0
    if is_routine == 0:
        try:
            start_dt = datetime.strptime(f"{row['date']} {row['time']}", "%Y-%m-%d %H:%M")
            end_dt = start_dt + timedelta(minutes=int(row['duration']))
            if now_dt > end_dt:
                continue # Expired one-time activity
        except:
            pass
    valid_rows.append(row)

# Scheduled Tasks Panel (Upper part of main page)
st.markdown(f"### 📋 Scheduled Tasks & Activities: {horizons[selected_horizon]}")

if not valid_rows:
    st.info("No active tasks scheduled for this horizon. Use the activity grid below or add a custom task in the sidebar.")
else:
    for row in valid_rows:
        is_routine_flag = row["is_routine"] if "is_routine" in row.keys() else 0
        rec_freq = row["recurrence_freq"] if "recurrence_freq" in row.keys() else "none"
        routine_badge = f'<span class="badge routine-badge" style="margin-left: 0.4rem;">🔄 Routine ({rec_freq})</span>' if is_routine_flag == 1 else ''
        
        st.markdown(f"""
        <div class="horizon-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <div>
                    <span style="font-size: 1.25rem; margin-right: 0.5rem;">{row['symbol']}</span>
                    <strong style="font-size: 1.1rem; color: #f8fafc;">{row['title']}</strong>
                    {routine_badge}
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
                
                n_is_routine = st.checkbox("Fixed Routine (Recurring)", value=bool(is_routine_flag), key=f"eroutine_{row['id']}")
                n_rec_freq = st.selectbox("Recurrence Frequency", ["daily", "weekly", "monthly", "yearly"], index=["daily", "weekly", "monthly", "yearly"].index(rec_freq) if rec_freq in ["daily", "weekly", "monthly", "yearly"] else 0, key=f"efreq_{row['id']}")
                
                n_notes = st.text_area("Notes (supports up to 1,000 words)", value=row['notes'] or "", key=f"enotes_{row['id']}")
                
                if st.form_submit_button("Save Changes"):
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
                            "UPDATE demo_activities SET symbol = ?, title = ?, date = ?, time = ?, duration = ?, notes = ?, is_routine = ?, recurrence_freq = ? WHERE id = ?",
                            (n_sym.strip() or "📌", n_title.strip() or "Untitled", n_date.strftime("%Y-%m-%d"), n_time.strip(), int(n_dur), n_notes.strip(), 1 if n_is_routine else 0, n_rec_freq if n_is_routine else "none", row['id'])
                        )
                        c.commit()
                        c.close()
                        st.session_state[f"edit_active_{row['id']}"] = False
                        st.success("Updated successfully!")
                        st.rerun()

st.markdown("<div style='margin-top: 2rem;'></div>", unsafe_allow_html=True)

# Activity/Element Cards Panel (Bottom part of page - 4 columns)
st.markdown("### ⚡ Activity & Element Grid (16 Quick Elements)")

starter_elements = [
    ("☕", "Morning Routine", "day", "08:00", 45, "Coffee & intention setting", 1, "daily"),
    ("💻", "Deep Work", "day", "09:30", 120, "Focused productivity sprint", 0, "none"),
    ("🥗", "Healthy Lunch", "day", "12:30", 60, "Midday break & nutrition", 1, "daily"),
    ("🚶", "Afternoon Walk", "day", "16:00", 30, "Fresh air and stretching", 0, "none"),
    ("🍳", "Family Dinner", "day", "19:00", 60, "Cooking & dining together", 1, "daily"),
    ("📚", "Reading", "day", "20:30", 45, "Book or article study", 0, "none"),
    ("🌙", "Wind Down", "day", "22:00", 30, "Screen-free relaxation", 1, "daily"),
    ("🗓️", "Weekly Review", "week", "10:00", 60, "Backlog & priority sorting", 1, "weekly"),
    ("🎯", "Milestone Check", "month", "14:00", 90, "Progress assessment", 1, "monthly"),
    ("📈", "Yearly Goal Setting", "year", "09:00", 120, "Core annual metrics", 1, "yearly"),
    ("🚀", "5-Year Roadmap", "fiveYears", "10:00", 180, "Long-term vision mapping", 0, "none"),
    ("🧘", "Meditation", "day", "07:30", 20, "Mindfulness practice", 1, "daily"),
    ("💧", "Hydration Break", "day", "11:00", 15, "Water and posture check", 1, "daily"),
    ("✍️", "Journaling", "day", "21:30", 20, "Reflections of the day", 1, "daily"),
    ("🧹", "Tidy Workspace", "day", "17:45", 15, "Clear desk for tomorrow", 1, "daily"),
    ("🎨", "Creative Hobby", "week", "15:00", 120, "Art, music, or side project", 0, "none")
]

cols_grid = st.columns(4)
for idx, (sym, title, def_hz, def_time, def_dur, def_notes, is_rout, r_freq) in enumerate(starter_elements):
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
                    "INSERT INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes, is_routine, recurrence_freq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (new_id, def_hz, sym, title, today_str, def_time, def_dur, def_notes, is_rout, r_freq)
                )
                c.commit()
                st.success(f"Scheduled '{title}'!")
                st.rerun()
            c.close()

st.markdown("<div style='margin-top: 2rem;'></div>", unsafe_allow_html=True)

# Sidebar Custom Task with Fixed Routine option & Backup Restore
st.sidebar.markdown("### ➕ Schedule Custom Task")
with st.sidebar.form("sidebar_add_form"):
    s_sym = st.text_input("Symbol", value="⚡")
    s_title = st.text_input("Title", value="Quick Task")
    s_date = st.date_input("Date", value=datetime.now())
    s_time = st.text_input("Time (HH:MM)", value="15:00")
    s_dur = st.number_input("Duration (min)", value=30, step=5)
    
    s_routine_box = st.checkbox("Fixed Routine (Recurring)")
    s_freq_box = st.selectbox("Recurrence Frequency", ["daily", "weekly", "monthly", "yearly"])
    
    s_notes = st.text_area("Notes (supports up to 1,000 words)", value="")
    
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
                "INSERT INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes, is_routine, recurrence_freq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, selected_horizon, s_sym.strip() or "📌", s_title.strip() or "Untitled", s_date.strftime("%Y-%m-%d"), s_time.strip(), int(s_dur), s_notes.strip(), 1 if s_routine_box else 0, s_freq_box if s_routine_box else "none")
            )
            c.commit()
            c.close()
            st.sidebar.success("Added successfully!")
            st.rerun()

st.sidebar.markdown("---")
st.sidebar.markdown("### 💾 Backup & Restore")

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

uploaded_file = st.sidebar.file_uploader("Restore JSON Backup", type=["json"])
if uploaded_file is not None:
    if st.sidebar.button("Confirm & Overwrite Data"):
        conn = None
        try:
            content = uploaded_file.read().decode("utf-8")
            parsed = json.loads(content)
            if not parsed or not isinstance(parsed, dict) or "activities" not in parsed or not isinstance(parsed["activities"], list):
                raise ValueError("Invalid backup file structure: missing 'activities' list.")
            
            validated_acts = []
            valid_horizons = {"day", "week", "month", "year", "fiveYears"}
            valid_frequencies = {"none", "daily", "weekly", "monthly", "yearly"}

            for idx, act in enumerate(parsed["activities"]):
                if not isinstance(act, dict):
                    raise ValueError(f"Activity at index {idx} is not a valid object.")
                
                act_id = str(act.get("id") or "").strip()
                horizon = str(act.get("horizon") or "").strip()
                symbol = str(act.get("symbol") or "📌").strip()
                title = str(act.get("title") or "").strip()
                date_str = str(act.get("date") or "").strip()
                time_str = str(act.get("time") or "").strip()
                
                if not act_id or not title:
                    raise ValueError(f"Activity at index {idx} is missing required 'id' or 'title'.")
                if horizon not in valid_horizons:
                    raise ValueError(f"Activity '{title}' has invalid horizon '{horizon}'.")
                
                try:
                    datetime.strptime(date_str, "%Y-%m-%d")
                except:
                    raise ValueError(f"Activity '{title}' has invalid date format '{date_str}' (expected YYYY-MM-DD).")
                
                try:
                    datetime.strptime(time_str, "%H:%M")
                except:
                    raise ValueError(f"Activity '{title}' has invalid time format '{time_str}' (expected HH:MM).")
                
                try:
                    duration = int(act.get("duration", 30))
                    if duration <= 0 or duration > 1440:
                        raise ValueError()
                except:
                    raise ValueError(f"Activity '{title}' has invalid duration '{act.get('duration')}'.")
                
                notes = str(act.get("notes") or "").strip()
                is_routine = int(act.get("is_routine", 0))
                if is_routine not in (0, 1):
                    is_routine = 0
                
                recurrence_freq = str(act.get("recurrence_freq") or "none").strip()
                if recurrence_freq not in valid_frequencies:
                    recurrence_freq = "none"

                validated_acts.append((act_id, horizon, symbol, title, date_str, time_str, duration, notes, is_routine, recurrence_freq))

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION;")
            try:
                cursor.execute("DELETE FROM demo_activities")
                cursor.executemany(
                    "INSERT INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes, is_routine, recurrence_freq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    validated_acts
                )
                conn.commit()
                st.sidebar.success("Backup restored successfully!")
                st.rerun()
            except Exception as inner_err:
                conn.rollback()
                raise inner_err
        except Exception as e:
            st.sidebar.error(f"Restore failed: {e}")
        finally:
            if conn:
                conn.close()

st.markdown("---")
st.markdown("<div style='text-align: center; color: #94a3b8; font-size: 0.85rem;'>Your friend LXNORO &bull; Futuristic Streamlit Community Cloud Demo</div>", unsafe_allow_html=True)
