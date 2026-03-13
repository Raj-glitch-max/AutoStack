import { Button } from './index';

export default function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            {Icon && <Icon size={48} strokeWidth={1} style={{ color: 'var(--border-default)' }} />}
            <h3 className="mt-4 text-base font-medium" style={{ color: 'var(--text-muted)' }}>{title}</h3>
            {description && (
                <p className="mt-1 text-[13px] max-w-[280px]" style={{ color: 'var(--text-dim)' }}>{description}</p>
            )}
            {action && (
                <div className="mt-4">
                    <Button variant="secondary" onClick={action.onClick}>{action.label}</Button>
                </div>
            )}
        </div>
    );
}
