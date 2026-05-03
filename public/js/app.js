/* ============================================
   LAST BYTE — Dashboard JavaScript
   ============================================ */

const API = '';  // Same origin
let accessToken = localStorage.getItem('lb_token') || '';
let currentUser = JSON.parse(localStorage.getItem('lb_user') || 'null');
let userLocation = JSON.parse(localStorage.getItem('lb_location') || 'null');
let quickDealFilter = 'all';

// ============ API HELPER ============

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (accessToken) opts.headers['Authorization'] = `Bearer ${accessToken}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ============ TOAST ============

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ============ AUTH TAB ============

function showAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
}

// ============ LOGIN ============

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await api('POST', '/api/auth/login', { email, password });
    accessToken = res.data.accessToken;
    currentUser = res.data.user;
    localStorage.setItem('lb_token', accessToken);
    localStorage.setItem('lb_refresh', res.data.refreshToken);
    localStorage.setItem('lb_user', JSON.stringify(currentUser));
    toast('Login successful!', 'success');
    onAuthStateChanged();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============ REGISTER ============

async function handleRegister(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('regName').value,
    email: document.getElementById('regEmail').value,
    phone: document.getElementById('regPhone').value,
    password: document.getElementById('regPassword').value,
  };
  try {
    const res = await api('POST', '/api/auth/register', body);
    accessToken = res.data.accessToken;
    currentUser = res.data.user;
    localStorage.setItem('lb_token', accessToken);
    localStorage.setItem('lb_refresh', res.data.refreshToken);
    localStorage.setItem('lb_user', JSON.stringify(currentUser));
    toast('Account created!', 'success');
    onAuthStateChanged();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============ LOGOUT ============

async function handleLogout() {
  try { await api('POST', '/api/auth/logout'); } catch (_) {}
  accessToken = '';
  currentUser = null;
  localStorage.removeItem('lb_token');
  localStorage.removeItem('lb_refresh');
  localStorage.removeItem('lb_user');
  toast('Logged out', 'info');
  onAuthStateChanged();
}

// ============ AUTH STATE ============

function onAuthStateChanged() {
  const loggedIn = !!currentUser;
  document.getElementById('sidebarUser').style.display = loggedIn ? 'flex' : 'none';
  document.getElementById('btnLogout').style.display = loggedIn ? 'flex' : 'none';

  if (loggedIn) {
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
  }

  // Show/hide nav sections by role
  document.getElementById('userNav').style.display = (currentUser?.role === 'user') ? 'block' : 'none';
  document.getElementById('shopNav').style.display = (currentUser?.role === 'shopOwner') ? 'block' : 'none';
  document.getElementById('adminNav').style.display = (currentUser?.role === 'admin') ? 'block' : 'none';

  // Shop owner real-time order notifications
  disconnectShopSocket();
  if (loggedIn && currentUser.role === 'shopOwner') {
    refreshShopOrderBadge();
    connectShopSocket();
  } else {
    updateShopOrderBadge(0);
  }

  // Navigate to appropriate view
  if (!loggedIn) {
    switchView('auth');
  } else if (currentUser.role === 'admin') {
    switchView('admin-stats');
  } else if (currentUser.role === 'shopOwner') {
    switchView('shop-listings');
  } else {
    switchView('listings');
  }
}

// ============ SHOP ORDER NOTIFICATIONS (Real-time via Socket.IO) ============

let socket = null;
let lastKnownPendingCount = 0;

function connectShopSocket() {
  // Disconnect any previous connection
  disconnectShopSocket();

  if (typeof io === 'undefined') return; // socket.io client not loaded

  socket = io();

  socket.on('connect', () => {
    // Join a room specific to this shop owner
    socket.emit('join-shop', currentUser._id);
  });

  // Instant notification when a new order is placed
  socket.on('new-order', (data) => {
    lastKnownPendingCount++;
    updateShopOrderBadge(lastKnownPendingCount);
    toast(`🔔 New order: ${data.itemTitle} × ${data.quantity} from ${data.customerName}`, 'info');

    // If the shop owner is currently viewing orders, auto-refresh the table
    const ordersView = document.getElementById('view-shop-orders');
    if (ordersView && ordersView.classList.contains('active')) {
      loadShopOrders();
    }
  });
}

function disconnectShopSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

async function refreshShopOrderBadge() {
  try {
    const res = await api('GET', '/api/orders/shop?status=pending&limit=50');
    const pendingCount = res.data?.length || 0;
    lastKnownPendingCount = pendingCount;
    updateShopOrderBadge(pendingCount);
  } catch (_) {
    // Silently ignore errors
  }
}

function updateShopOrderBadge(count) {
  const badge = document.getElementById('shopOrderBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.add('visible');
  } else {
    badge.textContent = '';
    badge.classList.remove('visible');
  }
}

// ============ NAVIGATION ============

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById('view-' + viewId);
  if (viewEl) viewEl.classList.add('active');

  const navEl = document.querySelector(`[data-view="${viewId}"]`);
  if (navEl) navEl.classList.add('active');

  // Load data for the view
  if (viewId === 'listings') loadPublicListings();
  if (viewId === 'user-orders') loadUserOrders();
  if (viewId === 'user-profile') loadUserProfile();
  if (viewId === 'shop-listings') loadShopListings();
  if (viewId === 'shop-orders') loadShopOrders();
  if (viewId === 'shop-profile') loadShopProfile();
  if (viewId === 'admin-users') loadAdminUsers();
  if (viewId === 'admin-shops') loadAdminShops();
  if (viewId === 'admin-moderation') loadAdminModeration();
  if (viewId === 'admin-insights') loadAdminInsights();
  if (viewId === 'admin-commission') loadCommissionSettings();
  if (viewId === 'admin-stats') loadAdminStats();
}

// Setup nav clicks
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.getElementById('btnLogout').addEventListener('click', handleLogout);

// ============ PUBLIC LISTINGS ============

let searchTimeout;
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadPublicListings, 400);
}

function setQuickDealFilter(filter) {
  quickDealFilter = filter;
  ['chipAllDeals', 'chipClosingSoon', 'chipBigDiscount'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  if (filter === 'all') document.getElementById('chipAllDeals')?.classList.add('active');
  if (filter === 'closingSoon') document.getElementById('chipClosingSoon')?.classList.add('active');
  if (filter === 'bigDiscount') document.getElementById('chipBigDiscount')?.classList.add('active');
  loadPublicListings();
}

function useMyLocation() {
  const status = document.getElementById('locationStatus');
  if (!navigator.geolocation) {
    toast('Location is not available in this browser', 'error');
    return;
  }
  if (status) status.textContent = 'Getting location...';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      localStorage.setItem('lb_location', JSON.stringify(userLocation));
      if (status) status.textContent = 'Sorted by nearby shops';
      loadPublicListings();
    },
    () => {
      if (status) status.textContent = 'Showing all shops';
      toast('Could not read your location', 'error');
    }
  );
}

async function loadPublicListings() {
  const grid = document.getElementById('publicListingsGrid');
  const search = document.getElementById('listingSearch').value;
  const category = document.getElementById('listingCategory').value;
  const dietaryType = document.getElementById('listingDietary')?.value || '';
  const cuisine = document.getElementById('listingCuisine')?.value || '';
  const availabilityType = document.getElementById('listingAvailability')?.value || '';
  const sort = document.getElementById('listingSort')?.value || '';
  const maxPrice = document.getElementById('listingMaxPrice')?.value || '';

  let url = '/api/listings?limit=50';
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (category) url += `&category=${category}`;
  if (dietaryType) url += `&dietaryType=${dietaryType}`;
  if (cuisine) url += `&cuisine=${cuisine}`;
  if (availabilityType) url += `&availabilityType=${availabilityType}`;
  if (maxPrice) url += `&maxPrice=${encodeURIComponent(maxPrice)}`;
  if (sort) url += `&sort=${sort}`;
  if (quickDealFilter === 'closingSoon') url += '&closingSoon=true&closingSoonMinutes=60';
  if (quickDealFilter === 'bigDiscount') url += '&minDiscount=80&sort=discount';
  if (userLocation) {
    url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&maxDistanceKm=25`;
    const status = document.getElementById('locationStatus');
    if (status) status.textContent = 'Sorted by nearby shops';
  }

  try {
    const res = await api('GET', url);
    if (res.data.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No listings found. Shop owners haven\'t added items yet.</p></div>';
      return;
    }
    grid.innerHTML = res.data.map(item => {
      const maxQty = Math.max(1, Math.min(item.quantity, item.maxQuantityPerUser || 2));
      return `
      <div class="listing-card clickable" onclick="openListingDetails('${item._id}')" tabindex="0" role="button" onkeydown="handleListingCardKey(event, '${item._id}')">
        <div class="listing-card-body">
          <div class="listing-card-top">
            <span class="listing-title">${esc(item.title)}</span>
            <span class="listing-badge badge-discount">${item.discountPercentage}% OFF</span>
          </div>
          ${item.isClosingSoon ? `<div class="deal-alert">${esc(item.dealBadge)}</div>` : ''}
          <p class="listing-desc">${esc(item.description || 'No description')}</p>
          <div class="listing-price">
            <span class="price-current">₹${item.discountedPrice}</span>
            <span class="price-original">₹${item.originalPrice}</span>
          </div>
          <div class="listing-tags">
            <span class="listing-badge badge-category">${item.category}</span>
            <span class="listing-badge badge-diet">${item.dietaryType}</span>
            <span class="listing-badge badge-cuisine">${item.cuisine}</span>
            <span class="listing-badge ${item.availabilityType === 'ready_now' ? 'badge-active' : 'badge-preorder'}">${item.availabilityType === 'ready_now' ? 'Ready now' : 'Pre-order'}</span>
          </div>
          <div class="deal-timing">
            <span>${item.minutesToExpire ?? '--'} mins left</span>
            <span>${item.pickupTimeMinutes ?? '--'} min pickup</span>
            <span>max ${item.maxQuantityPerUser || 2}/user</span>
            ${item.distanceKm !== undefined && item.distanceKm !== null ? `<span>${item.distanceKm} km away</span>` : ''}
            ${item.quantity > 0 ? `<span>${item.quantity} left</span>` : ''}
          </div>
          <div class="listing-meta">
            <span class="listing-shop">🏪 ${esc(item.shopOwner?.shopName || 'Unknown Shop')}</span>
            ${item.googleMapsUrl ? `<a class="map-link" href="${item.googleMapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Map</a>` : `<span>${timeAgo(item.createdAt)}</span>`}
          </div>
          <div class="listing-card-actions">
            ${currentUser?.role === 'user' ? `
              <button class="btn btn-card-order" onclick="event.stopPropagation(); quickBookOrder('${item._id}', ${maxQty}, this)" id="quickOrder-${item._id}">
                <span class="btn-order-icon">🛒</span> Order Now
              </button>
            ` : !currentUser ? `
              <button class="btn btn-card-login" onclick="event.stopPropagation(); switchView('auth');">
                <span class="btn-order-icon">🔐</span> Login to Order
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
  }
}

function handleListingCardKey(event, id) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openListingDetails(id);
  }
}

async function openListingDetails(id) {
  openModal('Loading deal...', '<div class="empty-state"><p>Loading item details...</p></div>');
  try {
    let url = `/api/listings/${id}`;
    if (userLocation) {
      url += `?lat=${userLocation.lat}&lng=${userLocation.lng}`;
    }

    const res = await api('GET', url);
    const item = res.data;
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalBody').innerHTML = renderListingDetails(item);
  } catch (err) {
    document.getElementById('modalTitle').textContent = 'Deal details';
    document.getElementById('modalBody').innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
  }
}

function renderListingDetails(item) {
  const shop = item.shopOwner || {};
  const pickupStart = formatDateTime(item.pickupWindow?.startAt);
  const pickupEnd = formatDateTime(item.pickupWindow?.endAt);
  const readyAt = formatDateTime(item.readyAt);
  const maxQuantityPerUser = item.maxQuantityPerUser || 2;
  const maxBookableNow = Math.max(1, Math.min(item.quantity, maxQuantityPerUser));

  return `
    <div class="deal-detail">
      <div class="detail-price-row">
        <div>
          <span class="price-current">₹${item.discountedPrice}</span>
          <span class="price-original">₹${item.originalPrice}</span>
        </div>
        <span class="listing-badge badge-discount">${item.discountPercentage}% OFF</span>
      </div>
      ${item.dealBadge ? `<div class="deal-alert detail-alert">${esc(item.dealBadge)}</div>` : ''}
      <p class="detail-description">${esc(item.description || 'No description')}</p>

      <div class="listing-tags">
        <span class="listing-badge badge-category">${esc(item.category)}</span>
        <span class="listing-badge badge-diet">${esc(item.dietaryType)}</span>
        <span class="listing-badge badge-cuisine">${esc(item.cuisine)}</span>
        <span class="listing-badge ${item.availabilityType === 'ready_now' ? 'badge-active' : 'badge-preorder'}">${item.availabilityType === 'ready_now' ? 'Ready now' : 'Pre-order'}</span>
      </div>

      <div class="detail-grid">
        <div class="detail-stat"><span>Expires in</span><strong>${item.minutesToExpire ?? '--'} mins</strong></div>
        <div class="detail-stat"><span>Quantity left</span><strong>${item.quantity}</strong></div>
        <div class="detail-stat"><span>Limit per user</span><strong>${maxQuantityPerUser}</strong></div>
        <div class="detail-stat"><span>Pickup time</span><strong>${item.pickupTimeMinutes ?? '--'} mins</strong></div>
        <div class="detail-stat"><span>Distance</span><strong>${item.distanceKm !== undefined && item.distanceKm !== null ? `${item.distanceKm} km` : 'Add location'}</strong></div>
      </div>

      <div class="detail-section">
        <h4>Pickup</h4>
        <p>${pickupStart || readyAt || 'Ready now'}${pickupEnd ? ` - ${pickupEnd}` : ''}</p>
      </div>

      <div class="detail-section">
        <h4>Shop</h4>
        <p><strong>${esc(shop.shopName || shop.name || 'Unknown Shop')}</strong></p>
        <p>${esc(shop.shopAddress || 'Address not available')}</p>
        ${shop.shopDescription ? `<p>${esc(shop.shopDescription)}</p>` : ''}
      </div>

      <div class="detail-actions">
        ${currentUser?.role === 'user' ? `
          <div class="order-quantity">
            <label for="orderQty">Qty</label>
            <input type="number" id="orderQty" min="1" max="${maxBookableNow}" value="1" />
          </div>
          <button class="btn btn-primary" onclick="bookOrder('${item._id}', ${maxBookableNow})">Book Order</button>
        ` : ''}
        ${!currentUser ? '<button class="btn btn-primary" onclick="switchView(\'auth\'); closeModal();">Login to Book</button>' : ''}
        ${item.googleMapsUrl ? `<a class="btn btn-primary" href="${item.googleMapsUrl}" target="_blank" rel="noopener">Open in Maps</a>` : ''}
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
}

async function bookOrder(listingId, maxQuantity) {
  const qtyInput = document.getElementById('orderQty');
  const quantity = parseInt(qtyInput?.value, 10) || 1;

  if (quantity < 1 || quantity > maxQuantity) {
    toast(`Choose a quantity between 1 and ${maxQuantity}`, 'error');
    return;
  }

  try {
    await api('POST', '/api/orders', { listingId, quantity });
    closeModal();
    toast('Order booked!', 'success');
    loadPublicListings();
    switchView('user-orders');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function quickBookOrder(listingId, maxQuantity, btnEl) {
  if (!currentUser || currentUser.role !== 'user') {
    switchView('auth');
    return;
  }

  // Disable button & show loading state
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="btn-order-icon">⏳</span> Booking...';
  }

  try {
    await api('POST', '/api/orders', { listingId, quantity: 1 });
    toast('Order booked! Check My Orders.', 'success');
    // Brief success state before refreshing
    if (btnEl) {
      btnEl.innerHTML = '<span class="btn-order-icon">✅</span> Booked!';
      btnEl.classList.add('btn-card-order-success');
    }
    setTimeout(() => loadPublicListings(), 800);
  } catch (err) {
    toast(err.message, 'error');
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = '<span class="btn-order-icon">🛒</span> Order Now';
    }
  }
}

// ============ USER ORDERS & PROFILE ============

function renderPickupCode(order) {
  if (!order.pickupCode) return '<span style="color:var(--text-muted);font-size:12px;">--</span>';
  return `<span class="pickup-code">${esc(order.pickupCode)}</span>`;
}

function renderPickupDeadline(order) {
  if (order.status === 'disqualified') return '<span style="color:var(--red);font-weight:700">Expired</span>';
  if (!order.pickupExpiresAt) return '<span style="color:var(--text-muted);font-size:12px;">--</span>';
  return `<span style="font-size:12px">${formatDateTime(order.pickupExpiresAt)}</span>`;
}

function renderShopPickupCodeState(order) {
  if (order.status === 'ready') return '<span style="color:var(--yellow);font-size:12px;font-weight:700">Ask customer</span>';
  if (order.pickupCodeVerifiedAt) return '<span style="color:var(--green);font-size:12px;font-weight:700">Verified</span>';
  return '<span style="color:var(--text-muted);font-size:12px;">--</span>';
}

let userOrdersCache = [];

function renderPickupVerificationPanel(orders) {
  const panel = document.getElementById('pickupVerificationPanel');
  if (!panel) return;

  const readyOrders = orders.filter(order => order.status === 'ready' && order.pickupCode);
  panel.classList.toggle('hidden', readyOrders.length === 0);

  if (readyOrders.length === 0) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = `
    <div class="pickup-panel-head">
      <div>
        <h3>Pickup Verification</h3>
        <p>Show this code at the shop counter before collecting your order.</p>
      </div>
      <span class="listing-badge badge-status-ready">${readyOrders.length} ready</span>
    </div>
    <div class="pickup-verification-grid">
      ${readyOrders.map(order => `
        <div class="pickup-verification-card">
          <div>
            <strong>${esc(order.itemSnapshot?.title || order.listing?.title || 'Item')}</strong>
            <span>${esc(order.shopSnapshot?.shopName || order.shopOwner?.shopName || 'Shop')} · Qty ${order.quantity}</span>
          </div>
          <div class="pickup-code-large">${esc(order.pickupCode)}</div>
          <div class="pickup-card-footer">
            <span>${order.pickupExpiresAt ? `Pickup by ${formatDateTime(order.pickupExpiresAt)}` : 'Ready for pickup'}</span>
            <button class="btn btn-sm btn-primary" onclick="openPickupCodeModal('${order._id}')">Show to shop</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function openPickupCodeModal(orderId) {
  const order = userOrdersCache.find(item => item._id === orderId);
  if (!order) return;

  openModal('Pickup Verification', `
    <div class="pickup-code-modal">
      <div>
        <span>${esc(order.shopSnapshot?.shopName || order.shopOwner?.shopName || 'Shop')}</span>
        <h3>${esc(order.itemSnapshot?.title || order.listing?.title || 'Item')}</h3>
      </div>
      <div class="pickup-code-display">${esc(order.pickupCode || '')}</div>
      <div class="detail-grid">
        <div class="detail-stat"><span>Quantity</span><strong>${order.quantity}</strong></div>
        <div class="detail-stat"><span>Pickup By</span><strong>${order.pickupExpiresAt ? formatDateTime(order.pickupExpiresAt) : '--'}</strong></div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    </div>
  `);
}

async function loadUserOrders() {
  const tbody = document.getElementById('userOrdersBody');
  const status = document.getElementById('userOrderStatus')?.value || '';
  let url = '/api/orders/my?limit=50';
  if (status) url += `&status=${status}`;

  try {
    const res = await api('GET', url);
    userOrdersCache = res.data || [];
    renderPickupVerificationPanel(userOrdersCache);

    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No orders booked yet.</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(order => `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${esc(order.itemSnapshot?.title || order.listing?.title || 'Item')}</td>
        <td>${esc(order.shopSnapshot?.shopName || order.shopOwner?.shopName || 'Shop')}</td>
        <td>${order.quantity}</td>
        <td style="color:var(--green);font-weight:700">₹${order.totalPrice}</td>
        <td>${renderPickupCode(order)}</td>
        <td><span class="listing-badge badge-status-${order.status}">${order.status}</span></td>
        <td>${renderPickupDeadline(order)}</td>
        <td style="font-size:12px">${formatDateTime(order.createdAt)}</td>
        <td class="actions">
          ${order.status === 'ready' ? `<button class="btn btn-sm btn-primary" onclick="openPickupCodeModal('${order._id}')">Show Code</button>` : ''}
          ${['pending','accepted'].includes(order.status) ? `<button class="btn btn-sm btn-danger" onclick="cancelUserOrder('${order._id}')">Cancel</button>` : ''}
          ${!['pending','accepted','ready'].includes(order.status) ? '<span style="color:var(--text-muted);font-size:12px;">Closed</span>' : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    renderPickupVerificationPanel([]);
    tbody.innerHTML = `<tr><td colspan="9">${esc(err.message)}</td></tr>`;
  }
}

async function cancelUserOrder(id) {
  if (!confirm('Cancel this order?')) return;
  try {
    await api('PATCH', `/api/orders/my/${id}/cancel`);
    toast('Order cancelled', 'success');
    loadUserOrders();
    loadPublicListings();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadUserProfile() {
  try {
    const res = await api('GET', '/api/auth/me');
    const u = res.data;
    document.getElementById('upName').value = u.name || '';
    document.getElementById('upEmail').value = u.email || '';
    document.getElementById('upPhone').value = u.phone || '';
    document.getElementById('upRole').value = u.role || '';
  } catch (err) { toast(err.message, 'error'); }
}

async function handleUserProfileUpdate(e) {
  e.preventDefault();
  try {
    const res = await api('PUT', '/api/auth/me', {
      name: document.getElementById('upName').value,
      phone: document.getElementById('upPhone').value,
    });
    currentUser = {
      ...currentUser,
      name: res.data.name,
      phone: res.data.phone,
      email: res.data.email,
    };
    localStorage.setItem('lb_user', JSON.stringify(currentUser));
    onAuthStateChanged();
    switchView('user-profile');
    toast('Profile updated!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ============ SHOP LISTINGS ============

async function loadShopListings() {
  const tbody = document.getElementById('shopListingsBody');
  try {
    const res = await api('GET', '/api/shop/listings?limit=50');
    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No listings yet. Click "+ New Listing" to add one.</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map(item => {
      const statusLabel = item.moderationStatus === 'rejected' ? 'Delisted' : (item.isAvailable ? 'Active' : 'Inactive');
      const statusClass = item.moderationStatus === 'rejected' ? 'badge-status-rejected' : (item.isAvailable ? 'badge-active' : 'badge-inactive');
      return `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${esc(item.title)}</td>
        <td><span class="listing-badge badge-category">${item.category}</span></td>
        <td>₹${item.originalPrice}</td>
        <td style="color:var(--green);font-weight:600">₹${item.discountedPrice}</td>
        <td>${item.quantity}</td>
        <td>${item.maxQuantityPerUser || 2}</td>
        <td><span class="listing-badge ${statusClass}">${statusLabel}</span></td>
        <td class="actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditListingModal('${item._id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteListing('${item._id}')">Delete</button>
        </td>
      </tr>
    `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">${esc(err.message)}</td></tr>`;
  }
}

function openCreateListingModal() {
  openModal('Create New Listing', `
    <form onsubmit="handleCreateListing(event)">
      <div class="form-group"><label>Title</label><input type="text" id="mlTitle" required /></div>
      <div class="form-group"><label>Description</label><textarea id="mlDesc" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Original Price (₹)</label><input type="number" id="mlOrigPrice" min="0" step="0.01" required /></div>
        <div class="form-group"><label>Discounted Price (₹)</label><input type="number" id="mlDiscPrice" min="0" step="0.01" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Quantity</label><input type="number" id="mlQty" min="1" value="1" /></div>
        <div class="form-group"><label>Limit Per User</label><input type="number" id="mlMaxPerUser" min="1" value="2" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Category</label>
          <select id="mlCategory">
            <option value="bakery">Bakery</option><option value="meals">Meals</option>
            <option value="snacks">Snacks</option><option value="beverages">Beverages</option>
            <option value="dairy">Dairy</option><option value="fruits">Fruits</option>
            <option value="vegetables">Vegetables</option><option value="other">Other</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Cuisine</label>
          <select id="mlCuisine">
            <option value="indian">Indian</option><option value="arabic">Arabic</option>
            <option value="bakery">Bakery</option><option value="continental">Continental</option>
            <option value="chinese">Chinese</option><option value="italian">Italian</option>
            <option value="desserts">Desserts</option><option value="other">Other</option>
          </select>
        </div>
        <div class="form-group"><label>Diet</label>
          <select id="mlDietaryType"><option value="veg">Veg</option><option value="non-veg">Non-veg</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Availability</label>
          <select id="mlAvailabilityType"><option value="ready_now">Ready now</option><option value="pre_order">Pre-order</option></select>
        </div>
        <div class="form-group"><label>Pickup Minutes</label><input type="number" id="mlPickupMinutes" min="0" value="15" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Expires At</label><input type="datetime-local" id="mlExpiresAt" /></div>
        <div class="form-group"><label>Ready At</label><input type="datetime-local" id="mlReadyAt" /></div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Create Listing</button>
    </form>
  `);
}

async function handleCreateListing(e) {
  e.preventDefault();
  try {
    await api('POST', '/api/shop/listings', {
      title: document.getElementById('mlTitle').value,
      description: document.getElementById('mlDesc').value,
      originalPrice: parseFloat(document.getElementById('mlOrigPrice').value),
      discountedPrice: parseFloat(document.getElementById('mlDiscPrice').value),
      quantity: parseInt(document.getElementById('mlQty').value),
      maxQuantityPerUser: parseInt(document.getElementById('mlMaxPerUser').value),
      category: document.getElementById('mlCategory').value,
      cuisine: document.getElementById('mlCuisine').value,
      dietaryType: document.getElementById('mlDietaryType').value,
      availabilityType: document.getElementById('mlAvailabilityType').value,
      averagePickupMinutes: parseInt(document.getElementById('mlPickupMinutes').value),
      expiresAt: toIsoOrUndefined(document.getElementById('mlExpiresAt').value),
      readyAt: toIsoOrUndefined(document.getElementById('mlReadyAt').value),
    });
    closeModal();
    toast('Listing created!', 'success');
    loadShopListings();
  } catch (err) { toast(err.message, 'error'); }
}

async function openEditListingModal(id) {
  try {
    const res = await api('GET', `/api/shop/listings/${id}`);
    const item = res.data;
    openModal('Edit Listing', `
      <form onsubmit="handleEditListing(event, '${id}')">
        <div class="form-group"><label>Title</label><input type="text" id="mlTitle" value="${esc(item.title)}" required /></div>
        <div class="form-group"><label>Description</label><textarea id="mlDesc" rows="2">${esc(item.description || '')}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label>Original Price (₹)</label><input type="number" id="mlOrigPrice" value="${item.originalPrice}" min="0" step="0.01" required /></div>
          <div class="form-group"><label>Discounted Price (₹)</label><input type="number" id="mlDiscPrice" value="${item.discountedPrice}" min="0" step="0.01" required /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Quantity</label><input type="number" id="mlQty" value="${item.quantity}" min="0" /></div>
          <div class="form-group"><label>Limit Per User</label><input type="number" id="mlMaxPerUser" value="${item.maxQuantityPerUser || 2}" min="1" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Category</label>
            <select id="mlCategory">
              ${['bakery','meals','snacks','beverages','dairy','fruits','vegetables','other'].map(c => `<option value="${c}" ${c===item.category?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Cuisine</label>
            <select id="mlCuisine">
              ${['indian','arabic','bakery','continental','chinese','italian','desserts','beverages','other'].map(c => `<option value="${c}" ${c===item.cuisine?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Diet</label>
            <select id="mlDietaryType">
              <option value="veg" ${item.dietaryType === 'veg' ? 'selected' : ''}>Veg</option>
              <option value="non-veg" ${item.dietaryType === 'non-veg' ? 'selected' : ''}>Non-veg</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Availability</label>
            <select id="mlAvailabilityType">
              <option value="ready_now" ${item.availabilityType === 'ready_now' ? 'selected' : ''}>Ready now</option>
              <option value="pre_order" ${item.availabilityType === 'pre_order' ? 'selected' : ''}>Pre-order</option>
            </select>
          </div>
          <div class="form-group"><label>Pickup Minutes</label><input type="number" id="mlPickupMinutes" value="${item.averagePickupMinutes || 15}" min="0" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Expires At</label><input type="datetime-local" id="mlExpiresAt" value="${toLocalDateTimeValue(item.expiresAt)}" /></div>
          <div class="form-group"><label>Ready At</label><input type="datetime-local" id="mlReadyAt" value="${toLocalDateTimeValue(item.readyAt)}" /></div>
        </div>
        <div class="form-group"><label>Available</label>
          <select id="mlAvail"><option value="true" ${item.isAvailable?'selected':''}>Active</option><option value="false" ${!item.isAvailable?'selected':''}>Inactive</option></select>
        </div>
        <button type="submit" class="btn btn-primary btn-full">Save Changes</button>
      </form>
    `);
  } catch (err) { toast(err.message, 'error'); }
}

async function handleEditListing(e, id) {
  e.preventDefault();
  try {
    await api('PUT', `/api/shop/listings/${id}`, {
      title: document.getElementById('mlTitle').value,
      description: document.getElementById('mlDesc').value,
      originalPrice: parseFloat(document.getElementById('mlOrigPrice').value),
      discountedPrice: parseFloat(document.getElementById('mlDiscPrice').value),
      quantity: parseInt(document.getElementById('mlQty').value),
      maxQuantityPerUser: parseInt(document.getElementById('mlMaxPerUser').value),
      category: document.getElementById('mlCategory').value,
      cuisine: document.getElementById('mlCuisine').value,
      dietaryType: document.getElementById('mlDietaryType').value,
      availabilityType: document.getElementById('mlAvailabilityType').value,
      averagePickupMinutes: parseInt(document.getElementById('mlPickupMinutes').value),
      expiresAt: toIsoOrUndefined(document.getElementById('mlExpiresAt').value),
      readyAt: toIsoOrUndefined(document.getElementById('mlReadyAt').value),
      isAvailable: document.getElementById('mlAvail').value === 'true',
    });
    closeModal();
    toast('Listing updated!', 'success');
    loadShopListings();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteListing(id) {
  if (!confirm('Delete this listing?')) return;
  try {
    await api('DELETE', `/api/shop/listings/${id}`);
    toast('Listing deleted', 'success');
    loadShopListings();
  } catch (err) { toast(err.message, 'error'); }
}

// ============ SHOP ORDERS ============

async function loadShopOrders() {
  const tbody = document.getElementById('shopOrdersBody');
  const status = document.getElementById('shopOrderStatus')?.value || '';
  let url = '/api/orders/shop?limit=50';
  if (status) url += `&status=${status}`;

  try {
    const res = await api('GET', url);
    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No customer orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(order => `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${esc(order.itemSnapshot?.title || order.listing?.title || 'Item')}</td>
        <td>
          <div style="font-weight:600;color:var(--text-primary)">${esc(order.user?.name || 'Customer')}</div>
          <div style="font-size:12px;color:var(--text-muted)">${esc(order.user?.email || '')}</div>
        </td>
        <td>${order.quantity}</td>
        <td style="color:var(--green);font-weight:700">₹${order.totalPrice}</td>
        <td>${renderShopPickupCodeState(order)}</td>
        <td><span class="listing-badge badge-status-${order.status}">${order.status}</span></td>
        <td>${renderPickupDeadline(order)}</td>
        <td style="font-size:12px">${formatDateTime(order.createdAt)}</td>
        <td class="actions">
          ${renderShopOrderActions(order)}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9">${esc(err.message)}</td></tr>`;
  }
}

function renderShopOrderActions(order) {
  if (['completed', 'cancelled', 'rejected', 'disqualified'].includes(order.status)) {
    return '<span style="color:var(--text-muted);font-size:12px;">Closed</span>';
  }

  const actions = [];
  if (order.status === 'pending') {
    actions.push(`<button class="btn btn-sm btn-success" onclick="updateShopOrderStatus('${order._id}', 'accepted')">Accept</button>`);
    actions.push(`<button class="btn btn-sm btn-danger" onclick="updateShopOrderStatus('${order._id}', 'rejected')">Reject</button>`);
  }
  if (order.status === 'accepted') {
    actions.push(`<button class="btn btn-sm btn-primary" onclick="updateShopOrderStatus('${order._id}', 'ready')">Ready</button>`);
  }
  if (order.status === 'ready') {
    actions.push(`<button class="btn btn-sm btn-success" onclick="updateShopOrderStatus('${order._id}', 'completed')">Verify Code</button>`);
  }
  return actions.join('');
}

async function updateShopOrderStatus(id, status) {
  try {
    const body = { status };
    if (status === 'completed') {
      const pickupCode = prompt('Enter the customer pickup code');
      if (!pickupCode) return;
      body.pickupCode = pickupCode;
    }

    await api('PATCH', `/api/orders/shop/${id}/status`, body);
    toast('Order updated', 'success');
    loadShopOrders();
    refreshShopOrderBadge();
  } catch (err) { toast(err.message, 'error'); }
}

async function verifyShopPickupCode(event) {
  event.preventDefault();
  const input = document.getElementById('shopPickupCodeInput');
  const pickupCode = input?.value.trim().toUpperCase();

  if (!pickupCode) {
    toast('Enter the pickup code shown by the customer', 'error');
    return;
  }

  try {
    const res = await api('POST', '/api/orders/shop/verify-pickup', { pickupCode });
    if (input) input.value = '';
    toast(res.message || 'Pickup code verified', 'success');
    loadShopOrders();
    refreshShopOrderBadge();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============ SHOP PROFILE ============

async function loadShopProfile() {
  try {
    const res = await api('GET', '/api/auth/me');
    const u = res.data;
    document.getElementById('spName').value = u.name || '';
    document.getElementById('spPhone').value = u.phone || '';
    document.getElementById('spShopName').value = u.shopName || '';
    document.getElementById('spShopAddress').value = u.shopAddress || '';
    document.getElementById('spShopDesc').value = u.shopDescription || '';
    document.getElementById('spShopLat').value = u.shopLocation?.coordinates?.[1] || '';
    document.getElementById('spShopLng').value = u.shopLocation?.coordinates?.[0] || '';
    document.getElementById('spPickupMinutes').value = u.averagePickupMinutes || 15;
  } catch (err) { toast(err.message, 'error'); }
}

async function handleShopProfileUpdate(e) {
  e.preventDefault();
  try {
    await api('PUT', '/api/shop/profile', {
      name: document.getElementById('spName').value,
      phone: document.getElementById('spPhone').value,
      shopName: document.getElementById('spShopName').value,
      shopAddress: document.getElementById('spShopAddress').value,
      shopDescription: document.getElementById('spShopDesc').value,
      shopLatitude: document.getElementById('spShopLat').value,
      shopLongitude: document.getElementById('spShopLng').value,
      averagePickupMinutes: parseInt(document.getElementById('spPickupMinutes').value),
    });
    toast('Profile updated!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ============ ADMIN — USERS ============

let adminUserTimeout;
function debounceAdminUserSearch() {
  clearTimeout(adminUserTimeout);
  adminUserTimeout = setTimeout(loadAdminUsers, 400);
}

async function loadAdminUsers() {
  const tbody = document.getElementById('adminUsersBody');
  const search = document.getElementById('adminUserSearch')?.value || '';
  let url = '/api/admin/users?limit=50';
  if (search) url += `&search=${encodeURIComponent(search)}`;
  try {
    const res = await api('GET', url);
    tbody.innerHTML = res.data.map(u => `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="listing-badge badge-role-${u.role}">${u.role}</span></td>
        <td><span class="listing-badge ${u.isActive ? 'badge-active' : 'badge-inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
        <td style="font-size:12px">${new Date(u.createdAt).toLocaleDateString()}</td>
        <td class="actions">
          <button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserActive('${u._id}', ${!u.isActive})">${u.isActive ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6">${esc(err.message)}</td></tr>`; }
}

async function toggleUserActive(id, active) {
  try {
    await api('PUT', `/api/admin/users/${id}`, { isActive: active });
    toast(`User ${active ? 'activated' : 'deactivated'}`, 'success');
    loadAdminUsers();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteUser(id) {
  if (!confirm('Delete this user permanently?')) return;
  try {
    await api('DELETE', `/api/admin/users/${id}`);
    toast('User deleted', 'success');
    loadAdminUsers();
  } catch (err) { toast(err.message, 'error'); }
}

// ============ ADMIN — SHOP OWNERS ============

async function loadAdminShops() {
  const tbody = document.getElementById('adminShopsBody');
  try {
    const res = await api('GET', '/api/admin/shop-owners?limit=50');
    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No shop owners yet.</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map(s => `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${esc(s.name)}</td>
        <td>${esc(s.email)}</td>
        <td>${esc(s.shopName || '—')}</td>
        <td style="font-size:12px">${esc(s.shopAddress || '—')}</td>
        <td><span class="listing-badge ${s.isActive ? 'badge-active' : 'badge-inactive'}">${s.shopApprovalStatus || (s.isActive ? 'Active' : 'Inactive')}</span></td>
        <td class="actions">
          <button class="btn btn-sm ${s.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleShopActive('${s._id}', ${!s.isActive})">${s.isActive ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteShop('${s._id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6">${esc(err.message)}</td></tr>`; }
}

function openCreateShopOwnerModal() {
  openModal('Add Shop Owner', `
    <form onsubmit="handleCreateShopOwner(event)">
      <div class="form-row">
        <div class="form-group"><label>Name</label><input type="text" id="msName" required /></div>
        <div class="form-group"><label>Email</label><input type="email" id="msEmail" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Password</label><input type="password" id="msPassword" minlength="6" required /></div>
        <div class="form-group"><label>Phone</label><input type="text" id="msPhone" /></div>
      </div>
      <div class="form-group"><label>Shop Name</label><input type="text" id="msShopName" required /></div>
      <div class="form-group"><label>Shop Address</label><input type="text" id="msShopAddress" required /></div>
      <div class="form-group"><label>Shop Description</label><textarea id="msShopDesc" rows="2"></textarea></div>
      <button type="submit" class="btn btn-primary btn-full">Create Shop Owner</button>
    </form>
  `);
}

async function handleCreateShopOwner(e) {
  e.preventDefault();
  try {
    await api('POST', '/api/admin/shop-owners', {
      name: document.getElementById('msName').value,
      email: document.getElementById('msEmail').value,
      password: document.getElementById('msPassword').value,
      phone: document.getElementById('msPhone').value,
      shopName: document.getElementById('msShopName').value,
      shopAddress: document.getElementById('msShopAddress').value,
      shopDescription: document.getElementById('msShopDesc').value,
    });
    closeModal();
    toast('Shop owner created!', 'success');
    loadAdminShops();
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleShopActive(id, active) {
  try {
    const res = await api('PUT', `/api/admin/shop-owners/${id}`, { isActive: active });
    const restored = res.visibleListingCount;
    toast(
      active && restored !== undefined
        ? `Shop owner activated. ${restored} non-expired listing(s) visible.`
        : `Shop owner ${active ? 'activated' : 'deactivated'}`,
      'success'
    );
    loadAdminShops();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteShop(id) {
  if (!confirm('Delete this shop owner and all their listings?')) return;
  try {
    await api('DELETE', `/api/admin/shop-owners/${id}`);
    toast('Shop owner deleted', 'success');
    loadAdminShops();
  } catch (err) { toast(err.message, 'error'); }
}

// ============ ADMIN — MODERATION ============

async function loadAdminModeration() {
  const shopsBox = document.getElementById('adminShopApprovals');
  const listingsBox = document.getElementById('adminListingReviews');
  const status = document.getElementById('adminListingReviewStatus')?.value || '';
  try {
    const [shopsRes, listingsRes] = await Promise.all([
      api('GET', '/api/admin/shop-owners?limit=50'),
      api('GET', `/api/admin/listings?limit=50${status ? `&moderationStatus=${status}` : ''}`),
    ]);

    shopsBox.innerHTML = shopsRes.data.map(shop => `
      <div class="moderation-row">
        <div>
          <strong>${esc(shop.shopName || shop.name)}</strong>
          <span>${esc(shop.email)} · ${esc(shop.shopAddress || 'No address')}</span>
        </div>
        <div class="actions">
          <span class="listing-badge badge-status-${shop.shopApprovalStatus || 'pending'}">${shop.shopApprovalStatus || 'pending'}</span>
          <button class="btn btn-sm btn-success" onclick="updateShopApproval('${shop._id}', 'approved')">Approve</button>
          <button class="btn btn-sm btn-danger" onclick="updateShopApproval('${shop._id}', 'rejected')">Reject</button>
        </div>
      </div>
    `).join('') || '<div class="empty-state">No shops found.</div>';

    listingsBox.innerHTML = listingsRes.data.map(item => `
      <div class="moderation-row">
        <div>
          <strong>${esc(item.title)}</strong>
          <span>${esc(item.shopOwner?.shopName || 'Unknown shop')} · ₹${item.discountedPrice} · reports ${item.reportCount || 0}</span>
        </div>
        <div class="actions">
          <span class="listing-badge badge-status-${item.moderationStatus}">${item.moderationStatus === 'approved' ? 'live' : item.moderationStatus === 'rejected' ? 'delisted' : 'pending'}</span>
          ${item.moderationStatus !== 'approved' ? `<button class="btn btn-sm btn-success" onclick="updateListingModeration('${item._id}', 'approved')">Relist</button>` : ''}
          ${item.moderationStatus !== 'rejected' ? `<button class="btn btn-sm btn-danger" onclick="updateListingModeration('${item._id}', 'rejected')">Delist</button>` : ''}
        </div>
      </div>
    `).join('') || '<div class="empty-state">No listings found.</div>';
  } catch (err) {
    shopsBox.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    listingsBox.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

async function updateShopApproval(id, status) {
  const reason = status === 'rejected' ? prompt('Reason for rejection?') || 'Rejected by admin' : '';
  try {
    await api('PATCH', `/api/admin/shop-owners/${id}/approval`, { status, reason });
    toast('Shop moderation updated', 'success');
    loadAdminModeration();
  } catch (err) { toast(err.message, 'error'); }
}

async function updateListingModeration(id, status) {
  const note = status === 'rejected' ? prompt('Reason for delisting?') || 'Delisted by admin' : '';
  try {
    await api('PATCH', `/api/admin/listings/${id}/moderation`, { status, note });
    toast(status === 'rejected' ? 'Listing delisted' : 'Listing relisted', 'success');
    loadAdminModeration();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadAdminInsights() {
  const summary = document.getElementById('insightsSummary');
  const areas = document.getElementById('topAreasList');
  const statuses = document.getElementById('orderStatusList');
  try {
    const [statsRes, insightsRes] = await Promise.all([
      api('GET', '/api/admin/stats'),
      api('GET', '/api/admin/insights'),
    ]);
    const d = statsRes.data;
    summary.innerHTML = `
      <div class="stat-card"><div class="stat-value">${d.totalOrders || 0}</div><div class="stat-label">Total Orders</div></div>
      <div class="stat-card"><div class="stat-value">₹${d.revenue || 0}</div><div class="stat-label">Revenue</div></div>
      <div class="stat-card"><div class="stat-value">₹${d.platformFees || 0}</div><div class="stat-label">Platform Fees</div></div>
      <div class="stat-card"><div class="stat-value">${d.activeUsers}/${d.inactiveUsers}</div><div class="stat-label">Active / Inactive Users</div></div>
    `;
    areas.innerHTML = insightsRes.data.topAreas.map(area => `
      <div class="insight-row"><strong>${esc(area._id || 'Unknown area')}</strong><span>${area.orders} orders · ₹${area.revenue}</span></div>
    `).join('') || '<div class="empty-state">No area data yet.</div>';
    statuses.innerHTML = insightsRes.data.orders.map(row => `
      <div class="insight-row"><strong>${esc(row._id || 'unknown')}</strong><span>${row.count} orders · ₹${row.revenue}</span></div>
    `).join('') || '<div class="empty-state">No orders yet.</div>';
  } catch (err) {
    summary.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

async function loadCommissionSettings() {
  try {
    const res = await api('GET', '/api/admin/settings');
    document.getElementById('platformFeePercent').value = res.data.platformFeePercent;
  } catch (err) { toast(err.message, 'error'); }
}

async function handleCommissionUpdate(e) {
  e.preventDefault();
  try {
    await api('PUT', '/api/admin/settings', {
      platformFeePercent: parseFloat(document.getElementById('platformFeePercent').value),
    });
    toast('Commission updated', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ============ ADMIN — STATS ============

async function loadAdminStats() {
  const grid = document.getElementById('statsGrid');
  try {
    const res = await api('GET', '/api/admin/stats');
    const d = res.data;
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${d.totalUsers}</div><div class="stat-label">Total Users</div></div>
      <div class="stat-card"><div class="stat-icon">🏬</div><div class="stat-value">${d.totalShopOwners}</div><div class="stat-label">Shop Owners</div></div>
      <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-value">${d.totalListings}</div><div class="stat-label">Total Listings</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">${d.activeListings}</div><div class="stat-label">Active Listings</div></div>
      <div class="stat-card"><div class="stat-icon">🧾</div><div class="stat-value">${d.totalOrders || 0}</div><div class="stat-label">Total Orders</div></div>
      <div class="stat-card"><div class="stat-icon">💸</div><div class="stat-value">₹${d.platformFees || 0}</div><div class="stat-label">Platform Fees</div></div>
      <div class="stat-card"><div class="stat-icon">🛡️</div><div class="stat-value">${d.pendingShops || 0}</div><div class="stat-label">Pending Shops</div></div>
      <div class="stat-card"><div class="stat-icon">🔎</div><div class="stat-value">${d.delistedListings || 0}</div><div class="stat-label">Delisted Listings</div></div>
    `;
  } catch (err) { grid.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`; }
}

// ============ MODAL ============

function openModal(title, bodyHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ============ UTILS ============

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function toIsoOrUndefined(value) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function toLocalDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ============ INIT ============

onAuthStateChanged();
