import streamlit as st
from datetime import datetime

st.set_page_config(
    page_title="Your friend LXNORO — Public Demo",
    page_icon="⏱️",
    layout="centered",
    initial_sidebar_state="collapsed",
)

# Dark theme styling matching LXNORO identity
st.markdown("""
<style>
    .stApp {
        background-color: #090d16;
        color: #f8fafc;
    }
    .main-header {
        font-size: 2.25rem;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        color: #94a3b8;
        font-size: 1.05rem;
        margin-bottom: 2rem;
    }
    .card {
        background-color: #121826;
        border: 1px solid #1e293b;
        padding: 1rem 1.25rem;
        border-radius: 10px;
        margin-bottom: 0.75rem;
    }
    .stButton>button {
        background-color: #a855f7;
        color: white;
        border-radius: 8px;
        border: none;
        font-weight: 600;
    }
    .stButton>button:hover {
        background-color: #9333ea;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<p class="main-header">Your friend LXNORO ⏱️</p>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Interactive Daily Time Matrix & Micro-Bot Activity Engine (Demo)</p>', unsafe_allow_html=True)

# Initialize session state for activities
if "activities" not in st.session_state:
    st.session_state.activities = [
        {"id": "1", "symbol": "☕", "title": "Morning Routine & Coffee", "time": "08:00", "duration": 45, "notes": "Quiet coffee, journal, and daily intention setting."},
        {"id": "2", "symbol": "💻", "title": "Deep Work / Study", "time": "09:30", "duration": 120, "notes": "Focused coding and core project architecture sprint."},
        {"id": "3", "symbol": "🥗", "title": "Healthy Lunch", "time": "12:30", "duration": 60, "notes": "Break away from screens, light walk outside."},
        {"id": "4", "symbol": "🏃", "title": "Afternoon Exercise", "time": "17:00", "duration": 45, "notes": "Cardio or stretching session."},
        {"id": "5", "symbol": "🌙", "title": "Wind Down", "time": "21:30", "duration": 30, "notes": "Review tomorrow's plan and disconnect."},
    ]

tab_schedule, tab_add = st.tabs(["📅 Today's Time Matrix", "➕ Add Activity Block"])

with tab_schedule:
    st.subheader("Chronological Schedule")
    
    if not st.session_state.activities:
        st.info("No activities scheduled yet. Use the 'Add Activity Block' tab to shape your day.")
    else:
        # Sort activities chronologically by time
        sorted_activities = sorted(st.session_state.activities, key=lambda x: x["time"])
        
        for idx, act in enumerate(sorted_activities):
            col1, col2, col3 = st.columns([0.7, 2.3, 1.0])
            with col1:
                st.markdown(f"**{act['time']}**<br><small style='color: #94a3b8;'>{act['duration']} mins</small>", unsafe_allow_html=True)
            with col2:
                st.markdown(f"**{act['symbol']} {act['title']}**<br><span style='color: #94a3b8; font-size: 0.85rem;'>{act['notes']}</span>", unsafe_allow_html=True)
            with col3:
                if st.button("Delete", key=f"del_{act['id']}"):
                    st.session_state.activities = [a for a in st.session_state.activities if a["id"] != act["id"]]
                    st.rerun()

with tab_add:
    st.subheader("Schedule New Time Block")
    with st.form("add_activity_form"):
        col_sym, col_title = st.columns([1, 3])
        with col_sym:
            symbol = st.text_input("Symbol / Emoji", value="🎯")
        with col_title:
            title = st.text_input("Activity Title", value="Study Session")
            
        col_time, col_dur = st.columns(2)
        with col_time:
            time_val = st.text_input("Start Time (HH:MM)", value="14:00")
        with col_dur:
            duration_val = st.number_input("Duration (minutes)", min_value=5, max_value=480, value=60, step=5)
            
        notes = st.text_area("Notes & Details", value="Review notes and complete exercises.")
        
        submitted = st.form_submit_button("Add to Schedule")
        if submitted:
            new_activity = {
                id(submitted): str(datetime.now().timestamp()),
                "symbol": symbol.strip() or "📌",
                "title": title.strip() or "Untitled",
                "time": time_val.strip() or "12:00",
                "duration": int(duration_val),
                "notes": notes.strip(),
            }
            # Fix dictionary keys correctly
            new_act_fixed = {
                "id": str(datetime.now().timestamp()),
                "symbol": symbol.strip() or "📌",
                "title": title.strip() or "Untitled",
                "time": time_val.strip() or "12:00",
                "duration": int(duration_val),
                "notes": notes.strip(),
            }
            st.session_state.activities.append(new_act_fixed)
            st.success("Activity added successfully!")
            st.rerun()

st.markdown("---")
st.markdown("<div style='text-align: center; color: #94a3b8; font-size: 0.85rem;'>Your friend LXNORO &bull; Public Streamlit Demo</div>", unsafe_allow_html=True)
