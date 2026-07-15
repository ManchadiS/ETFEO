import { Component, inject, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Order, OrderItem, FoodItem, Customer } from '../../services/api.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent implements OnInit, OnDestroy {
  private apiService = inject(ApiService);

  // View state: 'menu' (order catalog & cart) or 'tracking' (live order status tracking page)
  view = signal<'menu' | 'tracking'>('menu');

  // Currently placed order for tracking
  placedOrder = signal<Order | null>(null);

  // Slider/Banner state
  activeSlide = signal<number>(0);
  private slideInterval: any = null;
  showCartDrawer = this.apiService.showCartDrawer;

  banners = [
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&h=400&q=80', title: 'Tadka Spicy Burgers', subtitle: 'Indulge in crispy flame-grilled double-deckers starting at ₹99!' },
    { image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&h=400&q=80', title: 'Tandoori Paneer Grills', subtitle: 'Rich cottage cheese charred to smoky perfection with rich marinades.' },
    { image: 'https://images.unsplash.com/photo-1621972750749-0fbb1abb7736?auto=format&fit=crop&w=1200&h=400&q=80', title: 'Chilled Lassi & Coolers', subtitle: 'Beat the heat with signature coolers and local refreshers!' }
  ];

  // Polling reference
  private statusPollInterval: any = null;

  // Auto-reset timers for order completion redirection
  private autoResetInterval: any = null;
  autoResetCountdown = signal<number>(20);

  // Combo builder state
  selectedShawarmaId = signal<string>('');
  selectedSideId = signal<string>('');
  selectedBeverageId = signal<string>('');
  comboQuantity = signal<number>(1);
  showMenuPostersModal = signal<boolean>(false);
  activePosterTab = signal<string>('meal');

  shawarmas = computed(() => {
    return this.allDishes().filter(f => f.category?.toLowerCase() === 'shawarma');
  });

  sides = computed(() => {
    return this.allDishes().filter(f => f.category?.toLowerCase() === 'sides');
  });

  beverages = computed(() => {
    return this.allDishes().filter(f => f.category?.toLowerCase() === 'beverages');
  });

  get selectedShawarmaPrice(): number {
    const item = this.allDishes().find(f => f.id === this.selectedShawarmaId());
    return item ? item.price : 0;
  }

  get selectedSidePrice(): number {
    const item = this.allDishes().find(f => f.id === this.selectedSideId());
    return item ? item.price : 0;
  }

  get selectedBeveragePrice(): number {
    const item = this.allDishes().find(f => f.id === this.selectedBeverageId());
    return item ? item.price : 0;
  }

  get liveComboTotalPrice(): number {
    const sum = this.selectedShawarmaPrice + this.selectedSidePrice + this.selectedBeveragePrice;
    if (sum === 0) return 0;
    return Math.max(0, sum - 20);
  }

  // Core signals
  allDishes = signal<FoodItem[]>([]);
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');

  // Selected Category filter for menu
  selectedCategory = signal<string>('All');

  // Search filter for dishes
  dishSearchQuery = signal<string>('');

  // Cart Form signals
  orderType = signal<'dinein' | 'takeaway'>('dinein');
  tableNo = signal<string>('');
  mobile = signal<string>('');
  emailId = signal<string>('');
  orderItems = this.apiService.orderItems;

  // Customer suggestion signals
  allCustomers = signal<Customer[]>([]);
  mobileSuggestions = signal<Customer[]>([]);
  emailSuggestions = signal<Customer[]>([]);
  showMobileSuggestions = signal<boolean>(false);
  showEmailSuggestions = signal<boolean>(false);

  // Track active restaurant change
  selectedRestaurantId = this.apiService.selectedRestaurantId;

  // Computed: Get distinct categories from menu items
  categories = computed<string[]>(() => {
    const list = this.allDishes();
    const cats = new Set(list.map(d => d.category).filter((c): c is string => !!c));
    return ['All', ...Array.from(cats)];
  });

  // Computed: Filtered dishes based on category and search query
  filteredDishes = computed(() => {
    const cat = this.selectedCategory();
    const query = this.dishSearchQuery().toLowerCase().trim();
    let list = this.allDishes();

    if (cat !== 'All') {
      list = list.filter(d => d.category === cat);
    }

    if (query) {
      list = list.filter(d => 
        d.name.toLowerCase().includes(query) ||
        (d.category || '').toLowerCase().includes(query) ||
        (d.description || '').toLowerCase().includes(query)
      );
    }
    return list;
  });

  constructor() {
    // Reload data when the active restaurant changes
    effect(() => {
      const restId = this.selectedRestaurantId();
      this.loadCustomers();
      this.loadDishes();
      this.resetToMenu();
    });
  }

  ngOnInit() {
    this.loadCustomers();
    this.loadDishes();
    this.restoreTrackedOrder();
    this.slideInterval = setInterval(() => {
      this.activeSlide.update(s => (s + 1) % 3);
    }, 4000);
  }

  ngOnDestroy() {
    this.stopStatusPolling();
    this.stopAutoResetTimer();
    if (this.slideInterval) {
      clearInterval(this.slideInterval);
    }
  }

  restoreTrackedOrder() {
    const savedOrderId = localStorage.getItem('trackedOrderId');
    if (!savedOrderId) return;

    this.isLoading.set(true);
    this.apiService.getOrder(savedOrderId).subscribe({
      next: (order) => {
        this.placedOrder.set(order);
        this.view.set('tracking');
        this.isLoading.set(false);

        if (order.status === 'completed') {
          this.startAutoResetTimer();
        } else if (order.status !== 'cancelled') {
          this.startStatusPolling(order.id!);
        }
      },
      error: (err) => {
        console.error('Failed to restore tracked order on reload, clearing storage:', err);
        localStorage.removeItem('trackedOrderId');
        this.isLoading.set(false);
      }
    });
  }

  loadCustomers() {
    this.isLoading.set(true);
    this.apiService.getCustomers().subscribe({
      next: (res) => {
        this.allCustomers.set(res);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching customers:', err);
        this.isLoading.set(false);
      }
    });
  }

  loadDishes() {
    this.apiService.getFoodItems(this.selectedRestaurantId()).subscribe({
      next: (data) => {
        this.allDishes.set(data);
      },
      error: (err) => {
        console.error('Error loading menu dishes:', err);
      }
    });
  }

  // CART OPERATIONS
  addToCart(dish: FoodItem) {
    const currentItems = [...this.orderItems()];
    const existingIndex = currentItems.findIndex(item => item.name === dish.name);

    if (existingIndex !== -1) {
      currentItems[existingIndex].quantity += 1;
    } else {
      currentItems.push({
        name: dish.name,
        price: dish.price,
        quantity: 1
      });
    }

    this.orderItems.set(currentItems);
    this.errorMessage.set('');
  }

  addComboItem() {
    const shId = this.selectedShawarmaId();
    const sideId = this.selectedSideId();
    const bevId = this.selectedBeverageId();

    if (!shId || !sideId || !bevId) return;

    const sh = this.allDishes().find(f => f.id === shId);
    const side = this.allDishes().find(f => f.id === sideId);
    const bev = this.allDishes().find(f => f.id === bevId);

    if (!sh || !side || !bev) return;

    // Calculate sum of individual items
    const rawPrice = sh.price + side.price + bev.price;
    // Subtract ₹20 combo discount
    const finalPrice = Math.max(0, rawPrice - 20);

    const comboName = `Combo Meal (${sh.name} + ${side.name} + ${bev.name})`;

    const currentItems = [...this.orderItems()];
    const existingIndex = currentItems.findIndex(item => item.name === comboName);

    if (existingIndex > -1) {
      currentItems[existingIndex].quantity += this.comboQuantity();
    } else {
      currentItems.push({
        name: comboName,
        price: finalPrice,
        quantity: this.comboQuantity()
      });
    }

    this.orderItems.set(currentItems);
    
    // Reset combo selection
    this.selectedShawarmaId.set('');
    this.selectedSideId.set('');
    this.selectedBeverageId.set('');
    this.comboQuantity.set(1);
  }

  removeFromCart(index: number) {
    const currentItems = [...this.orderItems()];
    currentItems.splice(index, 1);
    this.orderItems.set(currentItems);
  }

  adjustCartQuantity(index: number, change: number) {
    const currentItems = [...this.orderItems()];
    const item = currentItems[index];
    item.quantity += change;
    if (item.quantity <= 0) {
      currentItems.splice(index, 1);
    }
    this.orderItems.set(currentItems);
  }

  get cartTotalAmount(): number {
    return this.orderItems().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  clearCart() {
    this.orderItems.set([]);
    this.tableNo.set('');
    this.mobile.set('');
    this.emailId.set('');
    this.orderType.set('dinein');
    this.dishSearchQuery.set('');
    this.selectedCategory.set('All');
  }

  // CUSTOMER AUTOCOMPLETE TRIGGERS (CART)
  onMobileChange(val: string) {
    this.mobile.set(val);
    this.showMobileSuggestions.set(true);
    const cleanMobile = val.trim();
    if (!cleanMobile) {
      this.mobileSuggestions.set([]);
      return;
    }
    const filtered = this.allCustomers().filter(c => c.mobile && c.mobile.includes(cleanMobile));
    this.mobileSuggestions.set(filtered);

    if (cleanMobile.length >= 10) {
      const match = this.allCustomers().find(c => c.mobile === cleanMobile);
      if (match && match.emailId && !this.emailId()) {
        this.emailId.set(match.emailId);
      }
    }
  }

  onEmailChange(val: string) {
    this.emailId.set(val);
    this.showEmailSuggestions.set(true);
    const cleanEmail = val.trim().toLowerCase();
    if (!cleanEmail) {
      this.emailSuggestions.set([]);
      return;
    }
    const filtered = this.allCustomers().filter(c => c.emailId && c.emailId.toLowerCase().includes(cleanEmail));
    this.emailSuggestions.set(filtered);

    if (cleanEmail.includes('@') && cleanEmail.includes('.') && cleanEmail.length > 5) {
      const match = this.allCustomers().find(c => c.emailId && c.emailId.toLowerCase() === cleanEmail);
      if (match && match.mobile && !this.mobile()) {
        this.mobile.set(match.mobile);
      }
    }
  }

  selectCustomerSuggestion(cust: Customer) {
    if (cust.mobile) {
      this.mobile.set(cust.mobile);
    }
    if (cust.emailId) {
      this.emailId.set(cust.emailId);
    }
    this.showMobileSuggestions.set(false);
    this.showEmailSuggestions.set(false);
  }

  hideSuggestionsWithDelay(type: 'mobile' | 'email') {
    setTimeout(() => {
      if (type === 'mobile') {
        this.showMobileSuggestions.set(false);
      } else {
        this.showEmailSuggestions.set(false);
      }
    }, 250);
  }

  // ORDER SUBMISSION (PLACE NEW ORDER)
  placeOrder() {
    const restId = this.selectedRestaurantId();
    if (!restId) {
      this.errorMessage.set('Please select an active restaurant outlet in the top bar.');
      return;
    }

    if (this.orderType() === 'dinein' && !this.tableNo().trim()) {
      this.errorMessage.set('Please enter a Table Number for Dine-In.');
      return;
    }

    if (this.orderItems().length === 0) {
      this.errorMessage.set('Your cart is empty. Click items in the menu to add them.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const calculatedTable = this.orderType() === 'takeaway' ? 'Take-Away' : this.tableNo().trim();

    const orderPayload: Order = {
      restaurantId: restId,
      tableNo: calculatedTable,
      orderType: this.orderType(),
      mobile: this.mobile().trim() || undefined,
      emailId: this.emailId().trim() || undefined,
      items: this.orderItems(),
      status: 'received',
      totalAmount: this.cartTotalAmount,
      date: new Date().toISOString().split('T')[0],
      discount: 0
    };

    this.apiService.createOrder(orderPayload).subscribe({
      next: (createdOrder) => {
        this.isSubmitting.set(false);
        this.clearCart();
        this.placedOrder.set(createdOrder);
        this.view.set('tracking');
        if (createdOrder.id) {
          localStorage.setItem('trackedOrderId', createdOrder.id);
          this.startStatusPolling(createdOrder.id);
        }
      },
      error: (err) => {
        console.error('Error placing order:', err);
        this.errorMessage.set('Failed to place order.');
        this.isSubmitting.set(false);
      }
    });
  }

  // LIVE STATUS POLLING METHODS
  startStatusPolling(orderId: string) {
    this.stopStatusPolling();
    this.statusPollInterval = setInterval(() => {
      this.apiService.getOrder(orderId).subscribe({
        next: (updatedOrder) => {
          this.placedOrder.set(updatedOrder);
          if (updatedOrder.status === 'completed') {
            this.stopStatusPolling();
            this.startAutoResetTimer();
          } else if (updatedOrder.status === 'cancelled') {
            this.stopStatusPolling();
          }
        },
        error: (err) => {
          console.error('Error polling order status:', err);
        }
      });
    }, 5000);
  }

  stopStatusPolling() {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
    }
  }

  // AUTO-REDIRECT TIMER TO MENU ON ORDER COMPLETED
  startAutoResetTimer() {
    this.stopAutoResetTimer();
    this.autoResetCountdown.set(20);
    this.autoResetInterval = setInterval(() => {
      const current = this.autoResetCountdown();
      if (current > 1) {
        this.autoResetCountdown.set(current - 1);
      } else {
        this.resetToMenu();
      }
    }, 1000);
  }

  stopAutoResetTimer() {
    if (this.autoResetInterval) {
      clearInterval(this.autoResetInterval);
      this.autoResetInterval = null;
    }
  }

  // MANUAL REFRESH BUTTON
  refreshOrderStatus() {
    const order = this.placedOrder();
    if (!order || !order.id) return;

    this.isLoading.set(true);
    this.apiService.getOrder(order.id).subscribe({
      next: (updatedOrder) => {
        this.placedOrder.set(updatedOrder);
        this.isLoading.set(false);
        if (updatedOrder.status === 'completed') {
          this.stopStatusPolling();
          this.startAutoResetTimer();
        } else if (updatedOrder.status === 'cancelled') {
          this.stopStatusPolling();
          this.stopAutoResetTimer();
        }
      },
      error: (err) => {
        console.error('Error updating status manually:', err);
        this.isLoading.set(false);
      }
    });
  }

  resetToMenu() {
    localStorage.removeItem('trackedOrderId');
    this.stopStatusPolling();
    this.stopAutoResetTimer();
    this.placedOrder.set(null);
    this.clearCart();
    this.view.set('menu');
  }

  getProgressBarWidth(): string {
    const status = this.placedOrder()?.status || 'received';
    switch (status) {
      case 'received': return '0%';
      case 'preparing': return '33.33%';
      case 'ready': return '66.66%';
      case 'completed': return '100%';
      case 'cancelled': return '0%';
      default: return '0%';
    }
  }

  isStepActive(stepName: string): boolean {
    return this.placedOrder()?.status === stepName;
  }

  isStepCompleted(stepName: string): boolean {
    const status = this.placedOrder()?.status || 'received';
    const statusOrder = ['received', 'preparing', 'ready', 'completed'];
    const currentIdx = statusOrder.indexOf(status);
    const targetIdx = statusOrder.indexOf(stepName);
    
    if (status === 'cancelled') return false;
    return targetIdx < currentIdx;
  }

  showMessage(msg: string, type: 'success' | 'error') {
    if (type === 'success') {
      this.successMessage.set(msg);
      setTimeout(() => this.successMessage.set(''), 4000);
    } else {
      this.errorMessage.set(msg);
      setTimeout(() => this.errorMessage.set(''), 4000);
    }
  }

  isVeg(name: string): boolean {
    const lower = name.toLowerCase();
    return !(lower.includes('chicken') || lower.includes('meat') || lower.includes('fish') || lower.includes('egg') || lower.includes('mutton') || lower.includes('alfredo'));
  }

  getDishQuantity(dish: FoodItem): number {
    const item = this.orderItems().find(i => i.name === dish.name);
    return item ? item.quantity : 0;
  }

  decrementCartItem(dish: FoodItem) {
    const currentItems = [...this.orderItems()];
    const existingIndex = currentItems.findIndex(item => item.name === dish.name);
    if (existingIndex !== -1) {
      currentItems[existingIndex].quantity -= 1;
      if (currentItems[existingIndex].quantity <= 0) {
        currentItems.splice(existingIndex, 1);
      }
      this.orderItems.set(currentItems);
      this.errorMessage.set('');
    }
  }

  toggleCartDrawer() {
    this.showCartDrawer.set(!this.showCartDrawer());
  }

  get cgst(): number {
    return this.cartTotalAmount * 0.025;
  }

  get sgst(): number {
    return this.cartTotalAmount * 0.025;
  }

  get grandTotal(): number {
    return this.cartTotalAmount + this.cgst + this.sgst;
  }

  get cartItemsCount(): number {
    return this.orderItems().reduce((sum, item) => sum + item.quantity, 0);
  }
}
