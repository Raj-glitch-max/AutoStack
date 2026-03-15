export function ToggleSwitch({ checked, onChange }) {
    return (
        <button onClick={() => onChange?.(!checked)} className="relative inline-flex cursor-pointer flex-shrink-0 rounded-full transition-colors duration-200"
            style={{ width: 36, height: 20, background: checked ? 'var(--blue-primary)' : 'var(--bg-card)', border: `1px solid ${checked ? 'var(--blue-primary)' : 'var(--border-default)'}` }}>
            <span className="rounded-full bg-white shadow transition-all duration-200 absolute top-0.5"
                style={{ width: 14, height: 14, left: checked ? 18 : 3 }} />
        </button>
    );
}
