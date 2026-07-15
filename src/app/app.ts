import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { ApiService, EmailStatus, Restaurant } from './services/api.service';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private router = inject(Router);
  
  protected readonly title = signal('Engineering Tadka Order Desk');
  
  // Status states
  apiConnected = signal<boolean>(false);
  dbMode = signal<string>('Checking...');
  emailUser = signal<string>('N/A');
  checkIntervalId: any;

  // Global restaurant selector state
  restaurants = signal<Restaurant[]>([]);
  selectedRestaurantId = this.apiService.selectedRestaurantId;

  // Shared cart state
  showCartDrawer = this.apiService.showCartDrawer;
  orderItems = this.apiService.orderItems;

  get cartItemsCount(): number {
    return this.orderItems().reduce((sum, item) => sum + item.quantity, 0);
  }

  toggleCart() {
    this.showCartDrawer.set(!this.showCartDrawer());
  }

  ngOnInit() {
    this.checkStatus();
    this.fetchRestaurants();

    // Periodically check connection status every 15 seconds
    this.checkIntervalId = setInterval(() => {
      this.checkStatus();
      this.fetchRestaurants();
    }, 15000);
  }

  ngOnDestroy() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => {
        this.restaurants.set(list);
        if ((!this.selectedRestaurantId() || this.selectedRestaurantId() === '') && list.length > 0) {
          this.apiService.selectedRestaurantId.set(list[0].id || '');
        }
      },
      error: (err) => {
        console.error('Error fetching restaurants in app shell:', err);
      }
    });
  }

  onRestaurantChange(id: string) {
    this.apiService.selectedRestaurantId.set(id);
  }

  checkStatus() {
    this.apiService.getEmailStatus().subscribe({
      next: (status: EmailStatus) => {
        this.apiConnected.set(true);
        if (status.useDb) {
          this.dbMode.set(status.dbConnected ? 'MongoDB' : 'MongoDB (Offline)');
        } else {
          this.dbMode.set('In-Memory');
        }
        this.emailUser.set(status.emailUser || 'Console Mock');
      },
      error: (err) => {
        this.apiConnected.set(false);
        this.dbMode.set('Offline');
        this.emailUser.set('Disconnected');
        console.error('API connection check failed:', err);
      }
    });
  }
}
