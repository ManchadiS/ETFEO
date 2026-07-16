import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Restaurant {
  id?: string;
  name: string;
  address?: string;
}

export interface FoodItem {
  id?: string;
  restaurantId?: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id?: string;
  restaurantId: string;
  tableNo: string;
  items: OrderItem[];
  status: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  totalAmount: number;
  date?: string;
  createdAt?: string;
  mobile?: string;
  emailId?: string;
  orderNumber?: number;
  discount?: number;
  orderType: 'dinein' | 'takeaway';
}

export interface Billing {
  id?: string;
  amount: number;
  restaurantId?: string;
  date?: string;
  description?: string;
  status: 'pending' | 'paid' | 'overdue';
  mobile?: string;
  emailId?: string;
  cgst?: number;
  sgst?: number;
  foodItems?: OrderItem[];
  orderNumber?: number;
  discount?: number;
  paymentMode?: string;
}

export interface Customer {
  id?: string;
  mobile?: string;
  emailId?: string;
  loyaltyPoints?: number;
}

export interface User {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  dob: string;
  age: number;
}

export interface EmailStatus {
  configured: boolean;
  service: string;
  emailUser: string;
  totalSent: number;
  totalFailed: number;
  totalLogs: number;
  useDb?: boolean;
  dbConnected?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://api.engineeringtadka.com/api/v1'; //prod url
  // private baseUrl = 'http://localhost:3000/api/v1';

  // Global active restaurant selection state
  selectedRestaurantId = signal<string>('');

  // Global cart visibility and items state
  orderItems = signal<OrderItem[]>([]);
  showCartDrawer = signal<boolean>(false);

  // User Authentication State (mocking / matching existing structure)
  currentUser = signal<User | null>(this.loadStoredUser());

  private loadStoredUser(): User | null {
    try {
      const data = localStorage.getItem('currentUser');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  setCurrentUser(user: User | null) {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
    this.currentUser.set(user);
  }

  // RESTAURANTS
  getRestaurants(): Observable<Restaurant[]> {
    return this.http.get<Restaurant[]>(`${this.baseUrl}/restaurants`);
  }

  // FOOD ITEMS / MENU
  getFoodItems(restaurantId?: string): Observable<FoodItem[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<FoodItem[]>(`${this.baseUrl}/food`, { params });
  }

  // ORDERS
  getOrders(restaurantId?: string): Observable<Order[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<Order[]>(`${this.baseUrl}/orders`, { params });
  }

  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/orders/${id}`);
  }

  createOrder(order: Order): Observable<Order> {
    return this.http.post<Order>(`${this.baseUrl}/orders`, order);
  }

  updateOrder(id: string, order: Partial<Order>): Observable<any> {
    return this.http.put(`${this.baseUrl}/orders/${id}`, order);
  }

  deleteOrder(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/orders/${id}`, { responseType: 'text' });
  }

  // BILLING
  createBill(bill: Billing): Observable<Billing> {
    return this.http.post<Billing>(`${this.baseUrl}/billing`, bill);
  }

  // CUSTOMERS
  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${this.baseUrl}/customers`);
  }

  createCustomer(cust: Customer): Observable<Customer> {
    return this.http.post<Customer>(`${this.baseUrl}/customers`, cust);
  }

  // STATUS & CONNECTIVITY
  getEmailStatus(): Observable<EmailStatus> {
    return this.http.get<EmailStatus>(`${this.baseUrl}/debug/email-status`);
  }
}
