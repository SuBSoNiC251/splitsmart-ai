import React, { useMemo, useState } from 'react';
import { ReceiptData, PersonSummary } from '../types';

interface SummaryCardProps {
  receiptData: ReceiptData;
  className?: string;
  onPersonSelect?: (person: PersonSummary) => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ receiptData, className, onPersonSelect }) => {
  const currency = receiptData.currencySymbol || '$';
  const [copied, setCopied] = useState(false);
  
  const summary: PersonSummary[] = useMemo(() => {
    // Phase 1: Calculate "Raw" Share for everyone (Base items + proportional tax/tip)
    // This represents what they WOULD owe if there were no discounts or fixed arrangements.
    
    const peopleMap = new Map<string, PersonSummary>();
    const tempPeopleMap = new Map<string, { rawSubtotal: number, rawTotal: number, items: any[] }>();

    // 1a. Items
    receiptData.items.forEach(item => {
      if (item.assignedTo.length > 0) {
        const splitCount = item.assignedTo.length;
        const pricePerPerson = item.price / splitCount;

        item.assignedTo.forEach(personName => {
          if (!tempPeopleMap.has(personName)) {
            tempPeopleMap.set(personName, { rawSubtotal: 0, rawTotal: 0, items: [] });
          }
          const person = tempPeopleMap.get(personName)!;
          person.items.push(item);
          person.rawSubtotal += pricePerPerson;
        });
      }
    });

    // 1b. Tax & Tip (Proportional to subtotal)
    const subtotal = receiptData.subtotal || 1; 
    const tipAmount = receiptData.tip || 0;
    const rawTaxGap = receiptData.total - receiptData.subtotal - tipAmount;
    const distributableTax = Math.max(0, rawTaxGap); 
    
    const taxRatio = distributableTax / subtotal;
    const tipRatio = tipAmount / subtotal;

    let totalRawShare = 0;

    tempPeopleMap.forEach((data, name) => {
        const taxShare = data.rawSubtotal * taxRatio;
        const tipShare = data.rawSubtotal * tipRatio;
        const rawTotal = data.rawSubtotal + taxShare + tipShare;
        
        data.rawTotal = rawTotal;
        totalRawShare += rawTotal;
        
        peopleMap.set(name, {
            name: name,
            items: data.items,
            subtotalOwed: data.rawSubtotal,
            taxOwed: taxShare,
            tipOwed: tipShare,
            totalOwed: rawTotal // Initial value, will be overridden below
        });
    });

    // Phase 2: Apply Discount to get Net Bill
    let netBill = receiptData.total;
    if (receiptData.discount) {
        if (receiptData.discount.type === 'percentage') {
            netBill = receiptData.total * (1 - receiptData.discount.value / 100);
        } else {
            netBill = Math.max(0, receiptData.total - receiptData.discount.value);
        }
    }

    // Phase 3: Handle Fixed Contributions
    // Logic: 
    // Remaining Bill = Net Bill - Sum(Fixed Amounts)
    // Remaining Bill is distributed to Non-Fixed people based on their Weight.
    // Weight = Their Raw Share / Sum(Raw Shares of Non-Fixed People)

    const fixedContribs = receiptData.fixedContributions || {};
    let fixedTotal = 0;
    let nonFixedRawTotal = 0;
    const fixedPeople = new Set(Object.keys(fixedContribs));

    // Calculate totals for fixed vs variable groups
    peopleMap.forEach((person, name) => {
        if (fixedPeople.has(name)) {
            fixedTotal += fixedContribs[name];
        } else {
            nonFixedRawTotal += person.totalOwed; // Using the Raw Total as weight
        }
    });

    const remainingBillToSplit = Math.max(0, netBill - fixedTotal);

    // Phase 4: Final Distribution
    return Array.from(peopleMap.values()).map(person => {
        let finalAmount = 0;
        let isFixed = false;

        if (fixedPeople.has(person.name)) {
            finalAmount = fixedContribs[person.name];
            isFixed = true;
        } else {
            // Variable person
            if (nonFixedRawTotal > 0) {
                const weight = person.totalOwed / nonFixedRawTotal;
                finalAmount = weight * remainingBillToSplit;
            } else {
                finalAmount = 0; // Should not happen unless bill is 0
            }
        }

        return {
            ...person,
            totalOwed: finalAmount,
            isFixed
        };
    }).sort((a, b) => b.totalOwed - a.totalOwed);

  }, [receiptData]);

  const unassignedTotal = useMemo(() => {
      return receiptData.items
        .filter(i => i.assignedTo.length === 0)
        .reduce((sum, i) => sum + i.price, 0);
  }, [receiptData]);

  const handleExport = () => {
    const header = `🧾 SplitSmart Summary for ${receiptData.merchantName || 'Bill'}\n`;
    let body = summary.map(p => {
        return `${p.name}: ${currency}${p.totalOwed.toFixed(2)} (${p.items.length} items)`;
    }).join('\n');

    if (unassignedTotal > 0.01) {
        body += `\n⚠️ Unassigned: ${currency}${unassignedTotal.toFixed(2)} + tax/tip`;
    }
    
    // Add discount note to export
    let footer = `\n\nTotal: ${currency}${receiptData.total.toFixed(2)}`;
    if (receiptData.discount) {
        const dVal = receiptData.discount.value;
        const dTxt = receiptData.discount.type === 'percentage' ? `${dVal}%` : `${currency}${dVal}`;
        footer += ` (After ${dTxt} discount)`;
    }
    
    const fullText = header + body + footer;
    
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`bg-white shadow-none md:shadow-lg md:rounded-xl border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden ${className}`}>
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10">
         <div className="flex items-center gap-2">
            <div className="bg-emerald-100 text-emerald-600 p-1.5 rounded-lg">
                <span className="material-icons text-lg block">pie_chart</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800">Bill Split</h2>
         </div>
         <button
           onClick={handleExport}
           className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all ${
               copied 
               ? 'bg-emerald-100 text-emerald-700' 
               : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
           }`}
         >
            <span className="material-icons text-sm">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy'}
         </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-3">
        {summary.length === 0 ? (
            <div className="text-center text-slate-400 mt-10">
                <span className="material-icons text-4xl mb-2">groups</span>
                <p className="text-sm">No assignments yet.</p>
            </div>
        ) : (
            summary.map((person) => (
                <div 
                  key={person.name}
                  onClick={() => onPersonSelect && onPersonSelect(person)}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                         <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center text-xs shrink-0">
                             {person.name.charAt(0).toUpperCase()}
                         </div>
                         <div className="min-w-0">
                             <span className="block font-bold text-slate-800 truncate">{person.name}</span>
                             <span className="text-xs text-slate-500 flex items-center gap-1">
                                 {person.items.length} items
                                 {person.isFixed && <span className="text-[10px] bg-slate-100 border border-slate-200 px-1 rounded text-slate-500 font-medium">FIXED</span>}
                             </span>
                         </div>
                    </div>
                    <div className="text-right">
                        <span className="block font-bold text-lg text-slate-800 group-hover:text-emerald-600 transition-colors">
                            {currency}{person.totalOwed.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full hidden group-hover:inline-block transition-all">
                            View Details
                        </span>
                    </div>
                </div>
            ))
        )}

        {unassignedTotal > 0.01 && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center gap-3">
                <span className="material-icons text-orange-500">warning</span>
                <div>
                    <p className="text-xs font-bold text-orange-800">Unassigned Items</p>
                    <p className="text-xs text-orange-700">
                        Totaling {currency}{unassignedTotal.toFixed(2)} (+tax/tip)
                    </p>
                </div>
            </div>
        )}
      </div>
      
      <div className="bg-white p-4 border-t border-slate-200 text-xs text-slate-400 text-center pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-4">
          Total Distributed: {currency}{summary.reduce((a,b)=>a+b.totalOwed, 0).toFixed(2)}
      </div>
    </div>
  );
};

export default SummaryCard;