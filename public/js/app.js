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
  document.getElementById('shopNav').style.display = (currentUser?.role === 'shopOwner') ? 'block' : 'none';
  document.getElementById('adminNav').style.display = (currentUser?.role === 'admin') ? 'block' : 'none';

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
  if (viewId === 'shop-listings') loadShopListings();
  if (viewId === 'shop-profile') loadShopProfile();
  if (viewId === 'admin-users') loadAdminUsers();
  if (viewId === 'admin-shops') loadAdminShops();
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
    grid.innerHTML = res.data.map(item => `
      <div class="listing-card">
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
            ${item.distanceKm !== undefined && item.distanceKm !== null ? `<span>${item.distanceKm} km away</span>` : ''}
            ${item.quantity > 0 ? `<span>${item.quantity} left</span>` : ''}
          </div>
          <div class="listing-meta">
            <span class="listing-shop">🏪 ${esc(item.shopOwner?.shopName || 'Unknown Shop')}</span>
            ${item.googleMapsUrl ? `<a class="map-link" href="${item.googleMapsUrl}" target="_blank" rel="noopener">Map</a>` : `<span>${timeAgo(item.createdAt)}</span>`}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
  }
}

// ============ SHOP LISTINGS ============

async function loadShopListings() {
  const tbody = document.getElementById('shopListingsBody');
  try {
    const res = await api('GET', '/api/shop/listings?limit=50');
    if (res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No listings yet. Click "+ New Listing" to add one.</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map(item => `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${esc(item.title)}</td>
        <td><span class="listing-badge badge-category">${item.category}</span></td>
        <td>₹${item.originalPrice}</td>
        <td style="color:var(--green);font-weight:600">₹${item.discountedPrice}</td>
        <td>${item.quantity}</td>
        <td><span class="listing-badge ${item.isAvailable ? 'badge-active' : 'badge-inactive'}">${item.isAvailable ? 'Active' : 'Inactive'}</span></td>
        <td class="actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditListingModal('${item._id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteListing('${item._id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${esc(err.message)}</td></tr>`;
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
        <td><span class="listing-badge ${s.isActive ? 'badge-active' : 'badge-inactive'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
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
    await api('PUT', `/api/admin/shop-owners/${id}`, { isActive: active });
    toast(`Shop owner ${active ? 'activated' : 'deactivated'}`, 'success');
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

// ============ INIT ============

onAuthStateChanged();
