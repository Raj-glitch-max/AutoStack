import { useState, useEffect } from 'react';
import { Search, Star, TrendingUp, Package, ArrowRight, Filter } from 'lucide-react';
import { Card, Button, Tag, EmptyState } from '../components/ui/index';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = ['All', 'Fullstack', 'Backend', 'Frontend', 'Data', 'AI/ML', 'Tooling'];
const SORT_OPTIONS = ['Most Popular', 'Newest', 'Lowest Cost'];

export default function MarketplacePage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('Most Popular');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/rest/v1/templates?published_at=not.is.null&select=*', {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      });
      const data = await response.json();
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates
    .filter(t => {
      const matchesSearch = !searchQuery || 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = selectedCategory === 'All' || 
        t.category?.toLowerCase() === selectedCategory.toLowerCase().replace('/', '');
      
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'Most Popular') return (b.deploy_count || 0) - (a.deploy_count || 0);
      if (sortBy === 'Newest') return new Date(b.published_at) - new Date(a.published_at);
      if (sortBy === 'Lowest Cost') return (a.cost_min || 0) - (b.cost_min || 0);
      return 0;
    });

  const featuredTemplates = templates.filter(t => t.featured);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black mb-2">Template Marketplace</h1>
            <p className="text-[var(--text-muted)]">
              Deploy production-ready applications in minutes
            </p>
          </div>
          <Button variant="outline" size="sm">
            Submit a Template
          </Button>
        </div>

        {/* Search and Filters */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--blue-primary)]"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--blue-primary)]"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-[var(--blue-primary)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </Card>

        {/* Featured Templates */}
        {featuredTemplates.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Star size={20} className="text-[var(--amber)]" />
              <h2 className="text-xl font-bold">Featured Templates</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredTemplates.map(template => (
                <TemplateCard key={template.id} template={template} featured />
              ))}
            </div>
          </div>
        )}

        {/* All Templates */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
              {selectedCategory === 'All' ? 'All Templates' : `${selectedCategory} Templates`}
            </h2>
            <span className="text-sm text-[var(--text-muted)]">
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="p-6 h-64 animate-pulse bg-[var(--bg-surface)]" />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No templates found"
              description="Try adjusting your search or filters"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {filteredTemplates.map(template => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, featured = false }) {
  const navigate = useNavigate();

  return (
    <Card className={`p-6 hover:border-[var(--blue-primary)] transition-all cursor-pointer group ${featured ? 'border-[var(--amber)]' : ''}`}>
      <div className="flex items-start gap-3 mb-4">
        {template.icon_url ? (
          <img src={template.icon_url} alt={template.name} className="w-12 h-12 rounded-lg" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--blue-primary)] to-[var(--purple)] flex items-center justify-center">
            <Package size={24} className="text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg mb-1 truncate">{template.name}</h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>by {template.author_name}</span>
            {template.verified && (
              <span className="text-[var(--blue-primary)]">✓</span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-3">
        {template.description}
      </p>

      <div className="flex flex-wrap gap-1 mb-4">
        {template.tags?.slice(0, 3).map(tag => (
          <Tag key={tag} size="xs" variant="outline">
            {tag}
          </Tag>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-4">
        <div className="flex items-center gap-1">
          <TrendingUp size={12} />
          <span>{template.deploy_count || 0} deploys</span>
        </div>
        <span className="font-mono">
          ${template.cost_min}–${template.cost_max}/mo
        </span>
      </div>

      <Button
        size="sm"
        className="w-full group-hover:bg-[var(--blue-primary)] group-hover:text-white"
        variant="outline"
        icon={ArrowRight}
        onClick={() => navigate(`/marketplace/${template.slug}`)}
      >
        Deploy
      </Button>
    </Card>
  );
}
