import { useState, useEffect } from 'react';

export function useCountUp(target, duration = 800, start = true) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (!start) return;
        let startTime;
        const ease = t => 1 - Math.pow(1 - t, 3);
        const animate = (ts) => {
            if (!startTime) startTime = ts;
            const progress = Math.min((ts - startTime) / duration, 1);
            setValue(Math.round(ease(progress) * target));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [target, duration, start]);
    return value;
}
