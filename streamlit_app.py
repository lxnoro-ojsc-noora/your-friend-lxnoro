import streamlit as st
import sqlite3
import os
from datetime import datetime

st.set_page_config(
    page_title="Your friend LXNORO — Futuristic MVP",
    page_icon="⏱️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Futuristic Dark Theme Styling (LXNORO Identity)
st.markdown("""
<style>
    .stApp {
        background-color: #090d16;
        color: #f8fafc;
        font-family: system-ui, -apple-system, sans-serif;
    }
    .main-header {
        font-size: 2.5rem;
        font-weight: 800;
        background: linear-gradient(135deg, #f8fafc 0%, #a855f7 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0rem;
    }
    .sub-header {
        color: #94a3b8;
        font-size: 1.05rem;
        margin-bottom: 2rem;
    }
    .horizon-card {
        background: rgba(18, 24, 38, 0.85);
        border: 1px solid rgba(168, 85, 247, 0.25);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        padding: 1.25rem;
        border-radius: 12px;
        margin-bottom: 1rem;
        transition: all 0.2s ease;
    }
    .horizon-card:hover {
        border-color: rgba(168, 85, 247, 0.5);
        box-shadow: 0 6px 24px rgba(168, 85, 247, 0.2);
    }
    .timetable-slot {
        background: rgba(30, 41, 59, 0.5);
        border-left: 4px solid #a855f7;
        padding: 0.75rem 1rem;
        border-radius: 6px;
        margin-bottom: 0.5rem;
    }
    .stButton>button {
        background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
        color: white;
        border-radius: 8px;
        border: none;
        font-weight: 600;
        padding: 0.5rem 1rem;
        box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);
    }
    .stButton>button:hover {
        background: linear-gradient(135deg, #9333ea 0%, #6d28d9 100%);
    }
    .badge {
        display: inline-block;
        padding: 0.2rem 0.6rem;
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
            ("1", "day", "☕", "Morning Routine & Coffee", today, "08:00", 45, "Quiet coffee, journal, and daily intention setting. Supports up to 1,000 words of notes without truncation."),
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

# Sidebar Navigation & Branding
st.sidebar.markdown("# ⏱️ LXNORO 03")
st.sidebar.markdown("<p style='color: #94a3b8; font-size: 0.85rem;'>Futuristic Personal Time Engine & Planning Matrix</p>", unsafe_allow_html=True)
st.sidebar.markdown("---")

horizons = {
    "day": "📅 Daily (Hourly Timetable)",
    "week": "📆 Weekly Schedule",
    "month": "🗓️ Monthly Planner",
    "year": "📈 Yearly Goals",
    "fiveYears": "🌟 Five-Year Vision"
}

selected_horizon = st.sidebar.radio("Select Planning Horizon", options=list(horizons.keys()), format_func=lambda x: horizons[x])

st.sidebar.markdown("---")
st.sidebar.markdown("### 💾 Storage & Persistence")
st.sidebar.markdown("<small style='color: #94a3b8;'>Persistent via local SQLite (`.data/streamlit_demo.sqlite`). Retained during active container sessions on Streamlit Community Cloud (subject to ephemeral container reset on full restart).</small>", unsafe_allow_html=True)

# Main Header
st.markdown('<p class="main-header">Your friend LXNORO</p>', unsafe_allow_html=True)
st.markdown(f'<p class="sub-header">Active Horizon: <strong>{horizons[selected_horizon]}</strong></p>', unsafe_allow_html=True)

# Fetch activities for selected horizon
conn = get_db()
cursor = conn.cursor()
cursor.execute("SELECT * FROM demo_activities WHERE horizon = ? ORDER BY date, time", (selected_horizon,))
rows = cursor.fetchall()
conn.close()

tab_view, tab_add = st.tabs(["📊 Horizon View & Edit", "➕ Create New Item"])

with tab_view:
    st.subheader(f"Structured View for {horizons[selected_horizon]}")
    
    if not rows:
        st.info("No items found in this horizon. Use the 'Create New Item' tab to add your first activity, task, or goal.")
    else:
        # Specialized rendering based on horizon type
        if selected_horizon == "day":
            st.markdown("### 🕒 Daily Hourly Timetable")
            for row in rows:
                st.markdown(f"""
                <div class="timetable-slot">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="font-size: 1.2rem; margin-right: 0.5rem;">{row['symbol']}</span>
                            <strong style="color: #f8fafc; font-size: 1.05rem;">{row['title']}</strong>
                        </div>
                        <div>
                            <span class="badge">⏰ {row['time']} ({row['duration']} mins)</span>
                        </div>
                    </div>
                    <p style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.3rem; margin-bottom: 0;">{row['notes'] or 'No notes.'}</p>
                </div>
                """, unsafe_allow_html=True)
                
                # Edit and Delete Controls
                col_edit, col_del, col_space = st.columns([1, 1, 4])
                with col_edit:
                    edit_key = f"edit_toggle_{row['id']}"
                    if st.button("✏️ Edit", key=f"btn_edit_{row['id']}"):
                        st.session_state[edit_key] = not st.session_state.get(edit_key, False)
                with col_del:
                    del_key = f"del_confirm_{row['id']}"
                    if st.button("🗑️ Delete", key=f"btn_del_{row['id']}"):
                        st.session_state[del_key] = True

                if st.session_state.get(f"del_confirm_{row['id']}", False):
                    st.warning("Are you sure you want to delete this item?")
                    c_yes, c_no = st.columns(2)
                    with c_yes:
                        if st.button("Yes, Delete", key=f"confirm_del_{row['id']}"):
                            c = get_db()
                            c.execute("DELETE FROM demo_activities WHERE id = ?", (row['id'],))
                            c.commit()
                            c.close()
                            st.session_state[f"del_confirm_{row['id']}"] = False
                            st.success("Item deleted successfully!")
                            st.rerun()
                    with c_no:
                        if st.button("Cancel", key=f"cancel_del_{row['id']}"):
                            st.session_state[f"del_confirm_{row['id']}"] = False
                            st.rerun()

                if st.session_state.get(f"edit_toggle_{row['id']}", False):
                    with st.form(key=f"form_edit_{row['id']}"):
                        st.markdown(f"**Edit Item: {row['title']}**")
                        e_sym = st.text_input("Symbol / Emoji", value=row['symbol'], key=f"es_{row['id']}")
                        e_title = st.text_input("Title", value=row['title'], key=f"et_{row['id']}")
                        
                        ec1, ec2, ec3 = st.columns(3)
                        try:
                            parsed_date = datetime.strptime(row['date'], "%Y-%m-%d").date()
                        except:
                            parsed_date = datetime.now().date()
                        with ec1:
                            e_date = st.date_input("Date", value=parsed_date, key=f"ed_{row['id']}")
                        with ec2:
                            e_time = st.text_input("Time (HH:MM)", value=row['time'], key=f"em_{row['id']}")
                        with ec3:
                            e_dur = st.number_input("Duration (mins)", min_value=5, max_value=1440, value=int(row['duration']), step=5, key=f"edu_{row['id']}")
                            
                        e_notes = st.text_area("Notes (supports up to 1,000 words without truncation)", value=row['notes'] or "", height=180, key=f"en_{row['id']}")
                        st.caption("ℹ️ Notes field supports up to 1,000 words.")
                        
                        if st.form_submit_button("💾 Save Changes"):
                            c = get_db()
                            c.execute(
                                "UPDATE demo_activities SET symbol = ?, title = ?, date = ?, time = ?, duration = ?, notes = ? WHERE id = ?",
                                (e_sym.strip() or "📌", e_title.strip() or "Untitled", e_date.strftime("%Y-%m-%d"), e_time.strip() or "12:00", int(e_dur), e_notes.strip(), row['id'])
                            )
                            c.commit()
                            c.close()
                            st.session_state[f"edit_toggle_{row['id']}"] = False
                            st.success("Changes saved successfully!")
                            st.rerun()

                st.markdown("<div style='margin-bottom: 1rem;'></div>", unsafe_allow_html=True)

        elif selected_horizon == "week":
            st.markdown("### 📆 Weekly Hourly Schedule (Grouped by Date)")
            # Group by date
            date_groups = {}
            for row in rows:
                d = row['date']
                if d not in date_groups:
                    date_groups[d] = []
                date_groups[d].append(row)
            
            for d, d_rows in sorted(date_groups.items()):
                with st.expander(f"📅 Date: {d} ({len(d_rows)} scheduled items)", expanded=True):
                    for row in d_rows:
                        st.markdown(f"""
                        <div class="timetable-slot">
                            <strong>{row['symbol']} {row['title']}</strong> &bull; 🕒 {row['time']} ({row['duration']}m)
                            <p style='color: #94a3b8; font-size: 0.85rem; margin: 0.2rem 0 0 0;'>{row['notes'] or 'No notes.'}</p>
                        </div>
                        """, unsafe_allow_html=True)
                        # Edit / Delete buttons for weekly items
                        col_e, col_d = st.columns([1, 6])
                        with col_e:
                            if st.button("✏️ Edit", key=f"wk_edit_{row['id']}"):
                                st.session_state[f"edit_toggle_{row['id']}"] = not st.session_state.get(f"edit_toggle_{row['id']}", False)
                        with col_d:
                            if st.button("🗑️ Delete", key=f"wk_del_{row['id']}"):
                                c = get_db()
                                c.execute("DELETE FROM demo_activities WHERE id = ?", (row['id'],))
                                c.commit()
                                c.close()
                                st.success("Deleted!")
                                st.rerun()

                        if st.session_state.get(f"edit_toggle_{row['id']}", False):
                            with st.form(key=f"form_edit_wk_{row['id']}"):
                                e_sym = st.text_input("Symbol", value=row['symbol'], key=f"wes_{row['id']}")
                                e_title = st.text_input("Title", value=row['title'], key=f"wet_{row['id']}")
                                e_time = st.text_input("Time", value=row['time'], key=f"wem_{row['id']}")
                                e_dur = st.number_input("Duration", value=int(row['duration']), key=f"weu_{row['id']}")
                                e_notes = st.text_area("Notes", value=row['notes'] or "", key=f"wen_{row['id']}")
                                if st.form_submit_button("Save"):
                                    c = get_db()
                                    c.execute("UPDATE demo_activities SET symbol=?, title=?, time=?, duration=?, notes=? WHERE id=?",
                                              (e_sym, e_title, e_time, int(e_dur), e_notes, row['id']))
                                    c.commit()
                                    c.close()
                                    st.session_state[f"edit_toggle_{row['id']}"] = False
                                    st.rerun()

        elif selected_horizon == "month":
            st.markdown("### 🗓️ Monthly Schedule & Dates")
            date_groups = {}
            for row in rows:
                d = row['date']
                if d not in date_groups:
                    date_groups[d] = []
                date_groups[d].append(row)
            
            for d, d_rows in sorted(date_groups.items()):
                st.markdown(f"#### 📅 {d}")
                for row in d_rows:
                    st.markdown(f"""
                    <div class="horizon-card" style="padding: 0.75rem 1rem;">
                        <strong>{row['symbol']} {row['title']}</strong> &bull; 🕒 {row['time']} ({row['duration']} mins)
                        <br><small style="color: #94a3b8;">{row['notes'] or ''}</small>
                    </div>
                    """, unsafe_allow_html=True)
                    if st.button("🗑️ Delete", key=f"mo_del_{row['id']}"):
                        c = get_db()
                        c.execute("DELETE FROM demo_activities WHERE id = ?", (row['id'],))
                        c.commit()
                        c.close()
                        st.rerun()

        else: # year or fiveYears
            st.markdown("### 🌟 Goals, Milestones & Long-Term Planning")
            for row in rows:
                st.markdown(f"""
                <div class="horizon-card">
                    <span style="font-size: 1.25rem; margin-right: 0.5rem;">{row['symbol']}</span>
                    <strong style="font-size: 1.1rem; color: #f8fafc;">{row['title']}</strong>
                    <span class="badge" style="float: right;">Target: {row['date']}</span>
                    <p style="color: #94a3b8; font-size: 0.9rem; margin-top: 0.5rem; white-space: pre-wrap;">{row['notes'] or 'No notes.'}</p>
                </div>
                """, unsafe_allow_html=True)
                
                col_e, col_d = st.columns([1, 6])
                with col_e:
                    if st.button("✏️ Edit", key=f"yr_edit_{row['id']}"):
                        st.session_state[f"edit_toggle_{row['id']}"] = not st.session_state.get(f"edit_toggle_{row['id']}", False)
                with col_d:
                    if st.button("🗑️ Delete", key=f"yr_del_{row['id']}"):
                        c = get_db()
                        c.execute("DELETE FROM demo_activities WHERE id = ?", (row['id'],))
                        c.commit()
                        c.close()
                        st.rerun()

                if st.session_state.get(f"edit_toggle_{row['id']}", False):
                    with st.form(key=f"form_edit_yr_{row['id']}"):
                        e_sym = st.text_input("Symbol", value=row['symbol'], key=f"yes_{row['id']}")
                        e_title = st.text_input("Title", value=row['title'], key=f"yet_{row['id']}")
                        e_notes = st.text_area("Notes", value=row['notes'] or "", key=f"yen_{row['id']}")
                        if st.form_submit_button("Save"):
                            c = get_db()
                            c.execute("UPDATE demo_activities SET symbol=?, title=?, notes=? WHERE id=?",
                                      (e_sym, e_title, e_notes, row['id']))
                            c.commit()
                            c.close()
                            st.session_state[f"edit_toggle_{row['id']}"] = False
                            st.rerun()

with tab_add:
    st.subheader(f"Create New Item in {horizons[selected_horizon]}")
    with st.form("create_activity_form"):
        col_sym, col_title = st.columns([1, 3])
        with col_sym:
            symbol = st.text_input("Symbol / Emoji", value="🎯")
        with col_title:
            title = st.text_input("Title / Activity Name", value="Focused Task / Routine")
            
        col_date, col_time, col_dur = st.columns(3)
        with col_date:
            date_val = st.date_input("Date", value=datetime.now())
        with col_time:
            time_val = st.text_input("Start Time (HH:MM)", value="14:00")
        with col_dur:
            duration_val = st.number_input("Duration (minutes)", min_value=5, max_value=1440, value=60, step=5)
            
        notes = st.text_area("Notes & Details (supports up to 1,000 words without truncation)", value="", height=200)
        st.caption("ℹ️ Multiline text area supporting up to 1,000 words.")
        
        submitted = st.form_submit_button("✨ Save New Item")
        if submitted:
            new_id = str(datetime.now().timestamp())
            c = get_db()
            c.execute(
                "INSERT INTO demo_activities (id, horizon, symbol, title, date, time, duration, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, selected_horizon, symbol.strip() or "📌", title.strip() or "Untitled", date_val.strftime("%Y-%m-%d"), time_val.strip() or "12:00", int(duration_val), notes.strip())
            )
            c.commit()
            c.close()
            st.success("New item created successfully!")
            st.rerun()

st.markdown("---")
st.markdown("<div style='text-align: center; color: #94a3b8; font-size: 0.85rem;'>Your friend LXNORO &bull; Modern Futuristic MVP Demo</div>", unsafe_allow_html=True)
