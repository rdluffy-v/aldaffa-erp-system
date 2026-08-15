/**
 * ============================================================================
 * SHARED TYPE CONTRACTS - READ-ONLY FOR ALL SUBAGENTS
 * ============================================================================
 *
 * This file defines ALL interfaces, schemas, and type contracts used across
 * the application. Once Phase 1 is complete, this file is LOCKED.
 *
 * All subagents MUST consume these types without modification.
 */

/**
 * @typedef {Object} Product
 * @property {string} id - Unique identifier
 * @property {string} name - Product name
 * @property {string} [category] - Category ID
 * @property {number} qty - Available quantity
 * @property {number} cost - Unit cost (for COGS)
 * @property {number} price - Retail price
 * @property {number} wholesale_price - Wholesale price
 * @property {number} original_price - Original price before discounts
 * @property {string} unit - Unit of measure (piece, liter, ml, kg, etc.)
 * @property {number} discount_rate - Default discount rate (%)
 * @property {number} capacity - Capacity in ml (for perfumes)
 * @property {string} [barcode] - Product barcode
 */

/**
 * @typedef {Object} CartItem
 * @property {string} product_id - Reference to Product.id
 * @property {string} name - Product name (denormalized)
 * @property {number} cart_qty - Quantity in cart
 * @property {string} unit - Unit of measure
 * @property {number} final_price - Final price per unit after adjustments
 * @property {number} unit_cost - Cost per unit (for profit calculation)
 * @property {number} [portion_ml] - Portion size in ml (for perfumes)
 * @property {number} [capacity] - Full capacity (for portion validation)
 */

/**
 * @typedef {Object} Sale
 * @property {number} id - Auto-increment ID
 * @property {string} date - ISO datetime
 * @property {number} subtotal - Subtotal before discount
 * @property {number} discount - Discount percentage
 * @property {number} total - Final total
 * @property {number} profit - Calculated profit
 * @property {string} payment_method - 'cash' | 'card' | 'bank_transfer'
 * @property {string} [debtor_id] - Reference to Debtor.id if credit sale
 * @property {string} [customer_name] - Customer name
 * @property {string} sale_pricing_mode - 'retail' | 'wholesale'
 * @property {string} type - 'store' | 'online'
 * @property {string} [phone] - Customer phone
 * @property {string} [notes] - Sale notes
 */

/**
 * @typedef {Object} SaleItem
 * @property {number} id - Auto-increment ID
 * @property {number} sale_id - Reference to Sale.id
 * @property {string} product_id - Reference to Product.id
 * @property {string} name - Product name (denormalized)
 * @property {number} cart_qty - Quantity sold
 * @property {string} unit - Unit of measure
 * @property {number} final_price - Price per unit at sale time
 * @property {number} unit_cost - Cost per unit at sale time
 * @property {number} [portion_ml] - Portion size if applicable
 */

/**
 * @typedef {Object} Purchase
 * @property {string} id - Unique identifier
 * @property {string} date - ISO datetime
 * @property {string} [supplier_name] - Supplier name
 * @property {number} total - Total purchase amount
 * @property {string} items_json - JSON array of PurchaseItem
 */

/**
 * @typedef {Object} PurchaseItem
 * @property {string} product_id - Reference to Product.id
 * @property {string} name - Product name
 * @property {number} quantity - Quantity purchased
 * @property {number} cost_per_unit - Cost per unit
 * @property {number} total_cost - Total cost (quantity × cost_per_unit)
 * @property {string} unit - Unit of measure
 */

/**
 * @typedef {Object} Debtor
 * @property {string} id - Unique identifier
 * @property {string} name - Debtor name
 * @property {string} [phone] - Contact phone
 * @property {number} total_debt - Current outstanding balance
 */

/**
 * @typedef {Object} DebtHistory
 * @property {string} id - Unique identifier
 * @property {string} debtor_id - Reference to Debtor.id
 * @property {string} date - ISO datetime
 * @property {string} type - 'credit' | 'payment'
 * @property {number} amount - Transaction amount
 * @property {number} [invoice_id] - Reference to Sale.id if from sale
 */

/**
 * @typedef {Object} Category
 * @property {string} id - Unique identifier
 * @property {string} name - Category name
 * @property {string} [icon] - Icon emoji/identifier
 */

/**
 * @typedef {Object} Withdrawal
 * @property {string} id - Unique identifier
 * @property {string} date - ISO datetime
 * @property {number} amount - Withdrawal amount
 * @property {string} [recipient] - Who received the money
 * @property {string} [reason] - Reason for withdrawal
 */

/**
 * @typedef {Object} CapitalInjection
 * @property {string} id - Unique identifier
 * @property {string} date - ISO datetime
 * @property {string} [donor_name] - Who provided the capital
 * @property {string} [donor_phone] - Donor contact
 * @property {number} amount - Injection amount
 * @property {string} [notes] - Additional notes
 */

/**
 * @typedef {Object} Gift
 * @property {string} id - Unique identifier
 * @property {string} date - ISO datetime
 * @property {string} [recipient_name] - Gift recipient
 * @property {string} [recipient_phone] - Recipient contact
 * @property {string} [reason] - Reason for gift
 * @property {string} [author] - Who authorized the gift
 * @property {string} [product_id] - Reference to Product.id
 * @property {string} item_name - Item name
 * @property {number} qty - Quantity gifted
 * @property {string} unit - Unit of measure
 * @property {number} cost_value - Total cost value
 */

/**
 * @typedef {Object} Loss
 * @property {string} id - Unique identifier
 * @property {string} date - ISO datetime
 * @property {string} item_name - Lost/damaged item name
 * @property {number} qty - Quantity lost
 * @property {string} unit - Unit of measure
 * @property {number} cost_value - Total cost value of loss
 * @property {string} [reason] - Reason for loss
 */

/**
 * @typedef {Object} Note
 * @property {string} id - Unique identifier
 * @property {string} date - ISO datetime
 * @property {string} [author] - Note author
 * @property {string} title - Note title
 * @property {string} content - Note content
 * @property {string} priority - 'low' | 'normal' | 'high' | 'urgent'
 */

/**
 * @typedef {Object} ReturnTransaction
 * @property {number} id - Auto-increment ID
 * @property {number} sale_id - Reference to Sale.id
 * @property {string} date - ISO datetime
 * @property {number} returned_amount - Amount returned to customer
 * @property {number} returned_cost - Cost of returned items
 * @property {string} items_json - JSON array of returned items
 */

// ============================================================================
// ZUSTAND STORE SCHEMAS - LOCKED INTERFACES
// ============================================================================

/**
 * @typedef {Object} CartStore
 * @property {CartItem[]} items - Cart items
 * @property {string} pricingMode - 'retail' | 'wholesale'
 * @property {number} discount - Global discount percentage
 * @property {string} paymentMethod - 'cash' | 'card' | 'bank_transfer'
 * @property {string} customerName - Customer name
 * @property {string} notes - Sale notes
 * @property {Function} addItem - Add item to cart
 * @property {Function} removeItem - Remove item from cart
 * @property {Function} updateQuantity - Update item quantity
 * @property {Function} updatePrice - Update item price
 * @property {Function} setDiscount - Set global discount
 * @property {Function} setPricingMode - Set pricing mode
 * @property {Function} setPaymentMethod - Set payment method
 * @property {Function} clear - Clear cart
 * @property {Function} getSubtotal - Calculate subtotal
 * @property {Function} getTotal - Calculate total
 * @property {Function} getProfit - Calculate profit
 */

/**
 * @typedef {Object} InventoryStore
 * @property {Product[]} products - All products
 * @property {boolean} loading - Loading state
 * @property {string|null} error - Error message
 * @property {string} searchTerm - Search filter
 * @property {string} categoryFilter - Category filter
 * @property {boolean} lowStockFilter - Low stock filter
 * @property {Function} loadProducts - Load all products
 * @property {Function} addProduct - Add new product
 * @property {Function} updateProduct - Update product
 * @property {Function} deleteProduct - Delete product
 * @property {Function} setSearchTerm - Set search term
 * @property {Function} setCategoryFilter - Set category filter
 * @property {Function} getFilteredProducts - Get filtered products
 */

/**
 * @typedef {Object} UIStore
 * @property {boolean} sidebarOpen - Sidebar visibility
 * @property {Object|null} activeModal - Active modal config
 * @property {Array} toasts - Toast notifications
 * @property {boolean} loading - Global loading state
 * @property {Function} toggleSidebar - Toggle sidebar
 * @property {Function} openModal - Open modal
 * @property {Function} closeModal - Close modal
 * @property {Function} addToast - Add toast notification
 * @property {Function} removeToast - Remove toast
 * @property {Function} setLoading - Set global loading
 */

/**
 * @typedef {Object} Toast
 * @property {string} id - Unique ID
 * @property {string} type - 'success' | 'error' | 'warning' | 'info'
 * @property {string} message - Toast message
 * @property {number} [duration] - Auto-dismiss duration (ms)
 */

// ============================================================================
// REPOSITORY INTERFACE - LOCKED CONTRACT
// ============================================================================

/**
 * @typedef {Object} RepositoryInterface
 * @property {Function} findAll - Find all records
 * @property {Function} findById - Find by ID
 * @property {Function} findOne - Find single record
 * @property {Function} create - Create new record
 * @property {Function} update - Update record
 * @property {Function} delete - Delete record
 * @property {Function} count - Count records
 * @property {Function} exists - Check existence
 * @property {Function} search - Search with LIKE
 * @property {Function} paginate - Paginated results
 */

// ============================================================================
// SERVICE INTERFACE - LOCKED CONTRACT
// ============================================================================

/**
 * @typedef {Object} SalesServiceInterface
 * @property {Function} completeSale - Complete sale transaction
 * @property {Function} getSalesHistory - Get sales history
 * @property {Function} getSaleById - Get sale details
 * @property {Function} calculateProfit - Calculate profit
 * @property {Function} getSalesSummary - Get aggregated summary
 */

/**
 * @typedef {Object} InventoryServiceInterface
 * @property {Function} adjustStock - Adjust stock levels
 * @property {Function} calculateWAC - Calculate weighted average cost
 * @property {Function} getLowStockItems - Get low stock items
 * @property {Function} getStockValue - Get total inventory value
 */

/**
 * @typedef {Object} PricingServiceInterface
 * @property {Function} calculatePortionPrice - Calculate portion price
 * @property {Function} applyDiscount - Apply discount to price
 * @property {Function} getEffectivePrice - Get effective price (retail/wholesale)
 */

// ============================================================================
// VALIDATION SCHEMAS (ZOD) - TO BE IMPLEMENTED BY SUBAGENTS
// ============================================================================

/**
 * Validation schemas will be implemented using Zod in separate files.
 * Subagents MUST reference these type definitions when creating validators.
 */

export {};
