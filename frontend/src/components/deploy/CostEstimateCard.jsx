import { useState } from 'react'
import { TrendingDown, Sparkles, Check } from 'lucide-react'

export function CostEstimateCard({ options, selectedOption, onSelect, className = '' }) {
  if (!options || options.length === 0) {
    return null
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-sm font-medium text-[#f1f5f9]">Choose your infrastructure</h3>
        <p className="text-xs text-[#7A8099] mt-0.5">
          AutoStack analyzed your app and recommends the most cost-efficient option.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {options.map(option => (
          <button
            key={option.id}
            onClick={() => onSelect(option)}
            className={`
              relative p-4 rounded-xl border text-left transition-all
              ${selectedOption?.id === option.id
                ? 'border-[#2463eb] bg-[#2463eb]/10 ring-2 ring-[#2463eb]/20'
                : 'border-[#1C2235] bg-[#0d1117] hover:border-[#334366] hover:bg-[#111520]'
              }
            `}
          >
            {option.recommended && (
              <div className="absolute -top-2 left-3 bg-[#2463eb] text-white text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                Recommended
              </div>
            )}

            {selectedOption?.id === option.id && (
              <div className="absolute -top-2 right-3 bg-[#22c55e] text-white rounded-full p-1">
                <Check className="w-3 h-3" />
              </div>
            )}

            <div className="text-sm font-medium text-[#f1f5f9] mb-1">{option.label}</div>
            <div className="text-xs text-[#7A8099] mb-3">{option.service}</div>

            <div className="text-2xl font-bold text-[#f1f5f9] font-mono mb-3">
              {option.cost.displayPrice}
            </div>

            <div className="text-xs text-[#7A8099] mb-3 line-clamp-2">
              {option.description}
            </div>

            {/* Cost breakdown */}
            <div className="mt-3 pt-3 border-t border-[#1C2235] space-y-1.5">
              {option.cost.breakdown.slice(0, 3).map(item => (
                <div key={item.component} className="flex justify-between text-xs gap-2">
                  <span className="text-[#4A5168] truncate">{item.component}</span>
                  <span className="text-[#7A8099] font-mono shrink-0">
                    ${item.monthlyCost.toFixed(2)}
                  </span>
                </div>
              ))}
              {option.cost.breakdown.length > 3 && (
                <div className="text-xs text-[#4A5168] italic">
                  +{option.cost.breakdown.length - 3} more items
                </div>
              )}
            </div>

            {/* Tradeoffs */}
            {option.tradeoffs && option.tradeoffs.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#1C2235] space-y-1">
                {option.tradeoffs.slice(0, 2).map((tradeoff, i) => (
                  <div key={i} className="flex gap-1.5 text-xs text-[#7A8099]">
                    <span className="text-[#4A5168]">•</span>
                    <span className="line-clamp-1">{tradeoff}</span>
                  </div>
                ))}
              </div>
            )}

            {/* LLM insight if available */}
            {option.llmNote && (
              <div className="mt-3 p-2 rounded-lg bg-[#111520] border border-[#1C2235]">
                <div className="flex gap-1.5 items-start">
                  <Sparkles className="w-3 h-3 text-[#a78bfa] mt-0.5 shrink-0" />
                  <p className="text-[10px] text-[#7A8099] leading-relaxed">{option.llmNote}</p>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Savings comparison */}
      {options[0]?.cost.savingsVsEKS > 10 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#4ade80]/5 border border-[#4ade80]/20">
          <TrendingDown className="w-4 h-4 text-[#4ade80] shrink-0" />
          <p className="text-xs text-[#4ade80]">
            AutoStack saved you <span className="font-semibold">${Math.round(options[0].cost.savingsVsEKS)}/month</span> by
            choosing {options[0].service} over EKS for this workload.
          </p>
        </div>
      )}

      {/* Analysis notes */}
      {options.length > 0 && (
        <div className="text-xs text-[#7A8099] space-y-1">
          <div className="font-medium text-[#f1f5f9]">Analysis notes:</div>
          <ul className="space-y-0.5 ml-4">
            <li>• Costs shown are estimates based on typical usage patterns</li>
            <li>• Actual costs may vary based on traffic and resource usage</li>
            <li>• All options include automatic scaling and monitoring</li>
          </ul>
        </div>
      )}
    </div>
  )
}

export function CostBreakdownModal({ option, onClose }) {
  if (!option) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1117] border border-[#1C2235] rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-[#1C2235]">
          <h2 className="text-lg font-semibold text-[#f1f5f9]">{option.label} — Cost Breakdown</h2>
          <p className="text-sm text-[#7A8099] mt-1">{option.service}</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Total cost */}
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-[#f1f5f9] font-mono">
              {option.cost.displayPrice}
            </div>
            <div className="text-sm text-[#7A8099]">estimated monthly cost</div>
          </div>

          {/* Detailed breakdown */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-[#f1f5f9]">Cost components:</div>
            {option.cost.breakdown.map(item => (
              <div key={item.component} className="flex justify-between items-start p-3 rounded-lg bg-[#111520] border border-[#1C2235]">
                <div className="flex-1">
                  <div className="text-sm text-[#f1f5f9]">{item.component}</div>
                  <div className="text-xs text-[#7A8099] mt-1">{item.note}</div>
                </div>
                <div className="text-lg font-semibold text-[#f1f5f9] font-mono ml-4">
                  ${item.monthlyCost.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Tradeoffs */}
          {option.tradeoffs && option.tradeoffs.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[#f1f5f9]">Considerations:</div>
              <ul className="space-y-2">
                {option.tradeoffs.map((tradeoff, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[#7A8099]">
                    <span className="text-[#4A5168]">•</span>
                    <span>{tradeoff}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Savings */}
          {option.cost.savingsVsEKS > 0 && (
            <div className="p-4 rounded-lg bg-[#4ade80]/5 border border-[#4ade80]/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-[#4ade80]" />
                <div className="text-sm font-medium text-[#4ade80]">Cost savings</div>
              </div>
              <p className="text-sm text-[#7A8099]">
                This option saves <span className="text-[#4ade80] font-semibold">${Math.round(option.cost.savingsVsEKS)}/month</span> compared
                to a naive EKS deployment.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[#1C2235] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#2463eb] text-white text-sm font-medium hover:bg-[#1d4ed8] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
