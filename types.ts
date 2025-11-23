export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  assignedTo: string[]; // List of names
}

export interface ReceiptData {
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  merchantName?: string;
  date?: string;
  location?: string;
  currencySymbol: string;
  discount?: { type: 'percentage' | 'fixed'; value: number }; // New field
  fixedContributions?: { [name: string]: number }; // New field: Name -> Amount
}

export interface PersonSummary {
  name: string;
  items: ReceiptItem[];
  subtotalOwed: number;
  taxOwed: number;
  tipOwed: number;
  totalOwed: number;
  isFixed?: boolean; // Helper for UI
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export enum AppState {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  SPLIT = 'SPLIT',
}