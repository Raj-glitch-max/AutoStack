/* Skeleton loading placeholders matching the design system. */

export function SkeletonText({ width = '100%', height = 12, className = '' }) {
    return (
        <div
            className={`rounded animate-shimmer ${className}`}
            style={{ width, height, background: 'var(--bg-card)' }}
        />
    );
}

export function SkeletonCard({ height = 120, className = '' }) {
    return (
        <div
            className={`rounded-xl animate-shimmer ${className}`}
            style={{ height, background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        />
    );
}

export function SkeletonRow({ columns = 5, className = '' }) {
    const widths = ['20%', '25%', '15%', '20%', '10%'];
    return (
        <div className={`flex items-center gap-4 py-3 px-4 ${className}`}>
            {Array.from({ length: columns }, (_, i) => (
                <SkeletonText key={i} width={widths[i % widths.length]} height={14} />
            ))}
        </div>
    );
}

export function SkeletonChart({ height = 200, className = '' }) {
    return (
        <div
            className={`rounded-xl animate-shimmer ${className}`}
            style={{ height, background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        />
    );
}

export function SkeletonScoreCard({ className = '' }) {
    return (
        <div
            className={`rounded-xl p-5 animate-shimmer ${className}`}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        >
            <SkeletonText width="60%" height={10} className="mb-3" />
            <SkeletonText width="40%" height={28} className="mb-2" />
            <SkeletonText width="80%" height={4} />
        </div>
    );
}
