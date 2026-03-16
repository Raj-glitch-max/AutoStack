const fs = require('fs');
const p = '/home/raj/Documents/AutoStack/frontend/src/components/tabs/SettingsTab.jsx';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
    /\(intsError \|\| membersError\) \? \([\s\S]*?\) : \([\s\S]*?<>[\s\S]*?\{subTab === 'Cloud Access' && \(/m,
    `(intsError || membersError) && (
                    <div className="animate-fadeIn pb-10">
                        <Card className="bg-[rgba(244,63,94,0.05)] mt-6 border-dashed" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
                            <EmptyState
                                icon={ShieldAlert}
                                title="Failed to Load Settings"
                                description="There was a problem fetching your settings data. Please try again."
                                action={{ label: 'Retry', onClick: () => window.location.reload() }}
                            />
                        </Card>
                    </div>
                )}

                {!(intsError || membersError) && subTab === 'Cloud Access' && (`
);

c = c.replace(/\{subTab === 'Integrations' && \(/g, "{!(intsError || membersError) && subTab === 'Integrations' && (");
c = c.replace(/\{subTab === 'Notifications' && \(/g, "{!(intsError || membersError) && subTab === 'Notifications' && (");
c = c.replace(/\{subTab === 'Team & Access' && \(/g, "{!(intsError || membersError) && subTab === 'Team & Access' && (");
c = c.replace(/\s*<\/>\s*\n\s*\)\}/, '');

fs.writeFileSync(p, c);
