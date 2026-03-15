import { useState, useEffect } from 'react';
import { Search, Filter, ExternalLink, BookOpen, MessageSquare, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { Card, Button, Tag, StatusDot, EmptyState } from '../components/ui/index';
import { useNavigate } from 'react-router-dom';

const TEAMS = ['All', 'Platform', 'Backend', 'Frontend', 'Data'];
const TIERS = ['All', 'Critical', 'Standard', 'Internal', 'Deprecated'];
const HEALTH_FILTERS = ['All', 'Healthy', 'Degraded', 'Down'];

export default function ServiceCatalogPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('All');
  const [selectedTier, setSelectedTier] = useState('All');
  const [selectedHealth, setSelectedHealth] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await fetch('/rest/v1/service_catalog?select=*', {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      });
      const data = await response.json();
      setServices(data || []);
    } catch (err) {
      console.error('Failed to fetch services:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredServices = services.filter(s => {
    const matchesSearch = !searchQuery || 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.team_owner?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTeam = selectedTeam === 'All' || s.team_owner === selectedTeam;
    const matchesTier = selectedTier === 'All' || s.service_tier === selectedTier.toLowerCase();
    
    const matchesHealth = selectedHealth === 'All' || 
      (selectedHealth === 'Healthy' && s.health_score >= 80) ||
      (selectedHealth === 'Degraded' && s.health_score >= 50 && s.health_score < 80) ||
      (selectedHealth === 'Down' && s.health_score < 50);
    
    return matchesSearch && matchesTeam && matchesTier && matchesHealth;
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black mb-2">Service Catalog</h1>
            <p className="text-[var(--text-muted)]">
              {services.length} service{services.length !== 1 ? 's' : ''} deployed
            </p>
          </div>
          <Button variant="outline" size="sm">
            + Register Service
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--blue-primary)]"
              />
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div className="flex gap-2 items-center">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Team:</span>
              {TEAMS.map(team => (
                <button
                  key={team}
                  onClick={() => setSelectedTeam(team)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    selectedTeam === team
                      ? 'bg-[var(--blue-primary)] text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Tier:</span>
              {TIERS.map(tier => (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    selectedTier === tier
                      ? 'bg-[var(--blue-primary)] text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Health:</span>
              {HEALTH_FILTERS.map(health => (
                <button
                  key={health}
                  onClick={() => setSelectedHealth(health)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    selectedHealth === health
                      ? 'bg-[var(--blue-primary)] text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {health}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Services Table */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--text-muted)]">Loading services...</div>
          ) : filteredServices.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Filter}
                title="No services found"
                description="Try adjusting your filters"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-surface)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-default)]">
                    <th className="py-3 px-6">Service</th>
                    <th className="py-3 px-6">Team</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Uptime 30d</th>
                    <th className="py-3 px-6">Last Deploy</th>
                    <th className="py-3 px-6">Cost/mo</th>
                    <th className="py-3 px-6 text-right">Links</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredServices.map(service => (
                    <ServiceRow key={service.id} service={service} navigate={navigate} now={Date.now()} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ServiceRow({ service, navigate, now }) {
  const getHealthColor = (score) => {
    if (score >= 80) return 'var(--green)';
    if (score >= 50) return 'var(--amber)';
    return 'var(--red)';
  };

  const getTierColor = (tier) => {
    if (tier === 'critical') return 'var(--red)';
    if (tier === 'standard') return 'var(--blue-primary)';
    if (tier === 'internal') return 'var(--text-muted)';
    return 'var(--text-dim)';
  };

  const formatLastDeploy = (date, now) => {
    if (!date) return 'Never';
    const diff = now - new Date(date).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <tr 
      className="border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.01)] transition-colors cursor-pointer"
      onClick={() => navigate(`/catalog/${service.id}`)}
    >
      <td className="py-4 px-6">
        <div>
          <div className="font-medium">{service.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <Tag size="xs" color={getTierColor(service.service_tier)}>
              {service.service_tier}
            </Tag>
            {service.environment_type && (
              <span className="text-[10px] text-[var(--text-muted)]">{service.environment_type}</span>
            )}
          </div>
        </div>
      </td>
      <td className="py-4 px-6">
        <span className="text-[var(--text-secondary)]">{service.team_owner || '—'}</span>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-2">
          <StatusDot 
            status={service.provisioning_status === 'live' ? 'success' : 'warning'} 
          />
          <span className="capitalize">{service.provisioning_status}</span>
        </div>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-2">
          <span style={{ color: getHealthColor(service.uptime_30d) }} className="font-mono font-bold">
            {service.uptime_30d?.toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          <Clock size={12} />
          <span className="text-xs">{formatLastDeploy(service.last_deployed_at, now)}</span>
        </div>
      </td>
      <td className="py-4 px-6">
        <span className="font-mono text-xs">${service.estimated_monthly_cost || 0}</span>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center justify-end gap-2">
          {service.runbook_url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(service.runbook_url, '_blank');
              }}
              className="p-1 hover:bg-[var(--bg-surface)] rounded"
              title="Runbook"
            >
              <BookOpen size={14} className="text-[var(--text-muted)]" />
            </button>
          )}
          {service.on_call_slack && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(`slack://channel?team=&id=${service.on_call_slack}`, '_blank');
              }}
              className="p-1 hover:bg-[var(--bg-surface)] rounded"
              title="On-call Slack"
            >
              <MessageSquare size={14} className="text-[var(--text-muted)]" />
            </button>
          )}
          {service.live_url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(service.live_url, '_blank');
              }}
              className="p-1 hover:bg-[var(--bg-surface)] rounded"
              title="Live URL"
            >
              <ExternalLink size={14} className="text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
