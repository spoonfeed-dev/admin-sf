// admin-panel/script.js
// admin-panel/script.js
import { db, auth, storage } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    deleteDoc, 
    doc,
    updateDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

class AdminPanel {
    constructor() {
        this.restaurantId = 'restaurant_1';
        this.menuRef = collection(db, `restaurants/${this.restaurantId}/menu_items`);
        this.categoriesRef = collection(db, `restaurants/${this.restaurantId}/categories`);
        this.selectedImage = null;
        this.currentView = 'all';
        this.editingItemId = null;
        this.allMenuItems = {};
        this.customCategories = [];
        this.defaultCategories = ['starters', 'mains', 'desserts', 'beverages'];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupAuthListener();
        this.setupPrioritySlider();
        this.createModalContainer();
    }

    setupEventListeners() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Add/Edit item form
        document.getElementById('add-item-form').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.editingItemId) {
                this.updateMenuItem();
            } else {
                this.addMenuItem();
            }
        });

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });
    }

    setupPrioritySlider() {
        const slider = document.getElementById('display-priority');
        const valueDisplay = document.getElementById('priority-value');
        
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
        });
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('✅ User authenticated:', user.email);
                this.showDashboard();
                this.loadCustomCategories();
                this.loadMenuItems();
            } else {
                console.log('❌ User not authenticated');
                this.showLogin();
            }
        });
    }

    // Create modal container
    createModalContainer() {
        const modalHTML = `
            <div id="custom-modal" class="modal-overlay">
                <div class="modal-container">
                    <div class="modal-header">
                        <div class="modal-icon" id="modal-icon">
                            <span id="modal-icon-symbol">!</span>
                        </div>
                        <h3 class="modal-title" id="modal-title">Confirm Action</h3>
                    </div>
                    <div class="modal-body">
                        <p class="modal-message" id="modal-message">Are you sure you want to proceed?</p>
                    </div>
                    <div class="modal-actions" id="modal-actions">
                        <button class="modal-btn modal-btn-secondary" id="modal-cancel">Cancel</button>
                        <button class="modal-btn modal-btn-primary" id="modal-confirm">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Setup modal event listeners
        document.getElementById('modal-cancel').addEventListener('click', () => this.hideModal());
        document.getElementById('custom-modal').addEventListener('click', (e) => {
            if (e.target.id === 'custom-modal') this.hideModal();
        });
        
        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideModal();
        });
    }

    // Show custom modal
    showModal(options) {
        const {
            type = 'warning',
            title = 'Confirm Action',
            message = 'Are you sure you want to proceed?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;

        const modal = document.getElementById('custom-modal');
        const icon = document.getElementById('modal-icon');
        const iconSymbol = document.getElementById('modal-icon-symbol');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        // Reset cancel button visibility
        cancelBtn.style.display = 'inline-flex';

        // Set icon based on type
        icon.className = `modal-icon ${type}`;
        
        // Update icon and button styling based on type
        switch (type) {
            case 'success':
                iconSymbol.setAttribute('data-lucide', 'check-circle');
                confirmBtn.className = 'modal-btn modal-btn-success';
                break;
            case 'error':
                iconSymbol.setAttribute('data-lucide', 'x-circle');
                confirmBtn.className = 'modal-btn modal-btn-primary';
                break;
            case 'info':
                iconSymbol.setAttribute('data-lucide', 'info');
                confirmBtn.className = 'modal-btn modal-btn-primary';
                break;
            default:
                iconSymbol.setAttribute('data-lucide', 'alert-triangle');
                confirmBtn.className = 'modal-btn modal-btn-primary';
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.innerHTML = `<i data-lucide="check"></i>${confirmText}`;
        cancelBtn.innerHTML = `<i data-lucide="x"></i>${cancelText}`;

        // Re-initialize icons for the modal
        lucide.createIcons();

        // Set up event handlers
        confirmBtn.onclick = () => {
            confirmBtn.classList.add('loading');
            onConfirm();
        };
        
        cancelBtn.onclick = () => {
            this.hideModal();
            onCancel();
        };

        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Hide modal
    hideModal() {
        const modal = document.getElementById('custom-modal');
        const confirmBtn = document.getElementById('modal-confirm');
        
        modal.classList.remove('active');
        confirmBtn.classList.remove('loading');
        document.body.style.overflow = '';
    }

    // Show success message modal
    showSuccessModal(message) {
        this.showModal({
            type: 'success',
            title: 'Success!',
            message: message,
            confirmText: 'OK',
            cancelText: '',
            onConfirm: () => this.hideModal()
        });
        
        // Hide cancel button for success messages
        document.getElementById('modal-cancel').style.display = 'none';
    }

    // Show error message modal
    showErrorModal(message) {
        this.showModal({
            type: 'error',
            title: 'Error',
            message: message,
            confirmText: 'OK',
            cancelText: '',
            onConfirm: () => this.hideModal()
        });
        
        // Hide cancel button for error messages
        document.getElementById('modal-cancel').style.display = 'none';
    }

    // Image preview functionality
    previewImage(event) {
        const file = event.target.files[0];
        const previewDiv = document.getElementById('image-preview');
        
        if (file) {
            this.selectedImage = file;
            
            if (!file.type.startsWith('image/')) {
                this.showErrorModal('Please select a valid image file');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) {
                this.showErrorModal('Image size should be less than 5MB');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                previewDiv.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        } else {
            this.selectedImage = null;
            previewDiv.innerHTML = '<p>No image selected</p>';
        }
    }

    async uploadImage(file, itemName) {
        try {
            const timestamp = Date.now();
            const fileName = `menu-items/${this.restaurantId}/${timestamp}_${file.name}`;
            const storageRef = ref(storage, fileName);
            
            console.log('📤 Uploading image:', fileName);
            
            const snapshot = await uploadBytes(storageRef, file);
            console.log('✅ Image uploaded successfully');
            
            const downloadURL = await getDownloadURL(snapshot.ref);
            console.log('🔗 Image URL:', downloadURL);
            
            return downloadURL;
        } catch (error) {
            console.error('❌ Error uploading image:', error);
            throw error;
        }
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.log('✅ Login successful');
        } catch (error) {
            console.error('❌ Login failed:', error);
            this.showErrorModal('Login failed: ' + error.message);
        }
    }

    async handleLogout() {
        try {
            await signOut(auth);
            console.log('✅ Logged out successfully');
        } catch (error) {
            console.error('❌ Logout failed:', error);
            this.showErrorModal('Logout failed: ' + error.message);
        }
    }

    showLogin() {
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('admin-dashboard').style.display = 'none';
    }

    showDashboard() {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
    }

    // Load custom categories from Firestore
    async loadCustomCategories() {
        try {
            onSnapshot(this.categoriesRef, (snapshot) => {
                this.customCategories = [];
                snapshot.forEach((doc) => {
                    this.customCategories.push({ id: doc.id, ...doc.data() });
                });
                
                console.log('📂 Loaded custom categories:', this.customCategories);
                this.displayCategories();
                this.updateCategoryDropdown();
            });
        } catch (error) {
            console.error('❌ Error loading categories:', error);
        }
    }

    // Display categories in the management section
    displayCategories() {
        const categoriesGrid = document.getElementById('categories-grid');
        if (!categoriesGrid) return;

        categoriesGrid.innerHTML = '';

        // Get all categories (default + custom)
        const allCategories = [...this.defaultCategories, ...this.customCategories.map(c => c.name)];
        
        allCategories.forEach(categoryName => {
            const isDefault = this.defaultCategories.includes(categoryName);
            const itemCount = this.allMenuItems[categoryName] ? this.allMenuItems[categoryName].length : 0;
            const customCategory = this.customCategories.find(c => c.name === categoryName);
            
            const categoryDiv = document.createElement('div');
            categoryDiv.className = `category-item ${isDefault ? 'default-category' : ''}`;
            categoryDiv.innerHTML = `
                <div>
                    <span class="category-name">${categoryName}</span>
                    <span class="category-count">${itemCount} items</span>
                </div>
                <div class="category-actions">
                    ${!isDefault ? `
                        <button class="btn-edit-category" onclick="adminPanel.editCategory('${customCategory?.id}', '${categoryName}')">
                            Edit
                        </button>
                        <button class="btn-delete-category" onclick="adminPanel.deleteCategory('${customCategory?.id}', '${categoryName}')">
                            Delete
                        </button>
                    ` : `
                        <span style="font-size: 10px; color: var(--text-secondary);">Default</span>
                    `}
                </div>
            `;
            categoriesGrid.appendChild(categoryDiv);
        });
    }

    // Update the category dropdown in the form
    updateCategoryDropdown() {
        const categorySelect = document.getElementById('item-category');
        if (!categorySelect) return;

        const currentValue = categorySelect.value;
        categorySelect.innerHTML = '<option value="">Select Category</option>';

        // Add default categories
        this.defaultCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categorySelect.appendChild(option);
        });

        // Add custom categories
        this.customCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.name;
            option.textContent = category.name.charAt(0).toUpperCase() + category.name.slice(1);
            categorySelect.appendChild(option);
        });

        // Restore previous value if it exists
        if (currentValue) {
            categorySelect.value = currentValue;
        }
    }

    // Add custom category
    async addCustomCategory() {
        const categoryName = document.getElementById('new-category-name').value.trim().toLowerCase();
        
        if (!categoryName) {
            this.showErrorModal('Please enter a category name.');
            return;
        }

        if (categoryName.length < 2) {
            this.showErrorModal('Category name must be at least 2 characters long.');
            return;
        }

        // Check if category already exists
        const allCategories = [...this.defaultCategories, ...this.customCategories.map(c => c.name)];
        if (allCategories.includes(categoryName)) {
            this.showErrorModal('This category already exists.');
            return;
        }

        try {
            const newCategory = {
                name: categoryName,
                createdAt: new Date(),
                restaurantId: this.restaurantId
            };

            console.log('📂 Adding custom category:', newCategory);
            await addDoc(this.categoriesRef, newCategory);
            
            document.getElementById('new-category-name').value = '';
            this.showSuccessModal(`Category "${categoryName}" has been added successfully!`);
            
        } catch (error) {
            console.error('❌ Error adding category:', error);
            this.showErrorModal('Failed to add category. Please try again.');
        }
    }

    // Edit category name
    async editCategory(categoryId, oldName) {
        const newName = prompt(`Enter new name for "${oldName}" category:`, oldName);
        
        if (!newName || newName.trim() === '') return;
        
        const trimmedName = newName.trim().toLowerCase();
        
        if (trimmedName === oldName) return;

        // Check if new name already exists
        const allCategories = [...this.defaultCategories, ...this.customCategories.map(c => c.name)];
        if (allCategories.includes(trimmedName)) {
            this.showErrorModal('A category with this name already exists.');
            return;
        }

        this.showModal({
            type: 'warning',
            title: 'Rename Category',
            message: `This will rename "${oldName}" to "${trimmedName}" and update all items in this category. Continue?`,
            confirmText: 'Rename Category',
            cancelText: 'Cancel',
            onConfirm: async () => {
                try {
                    // Update category document
                    const categoryDoc = doc(db, `restaurants/${this.restaurantId}/categories`, categoryId);
                    await updateDoc(categoryDoc, { 
                        name: trimmedName,
                        updatedAt: new Date()
                    });

                    // Update all menu items in this category
                    const itemsInCategory = this.allMenuItems[oldName] || [];
                    if (itemsInCategory.length > 0) {
                        const batch = writeBatch(db);
                        itemsInCategory.forEach(item => {
                            const itemDoc = doc(db, `restaurants/${this.restaurantId}/menu_items`, item.id);
                            batch.update(itemDoc, { 
                                category: trimmedName,
                                updatedAt: new Date()
                            });
                        });
                        await batch.commit();
                    }

                    this.hideModal();
                    setTimeout(() => {
                        this.showSuccessModal(`Category renamed from "${oldName}" to "${trimmedName}" successfully!`);
                    }, 300);
                    
                } catch (error) {
                    console.error('❌ Error renaming category:', error);
                    this.hideModal();
                    setTimeout(() => {
                        this.showErrorModal('Failed to rename category. Please try again.');
                    }, 300);
                }
            }
        });
    }

    // Delete custom category
    async deleteCategory(categoryId, categoryName) {
        const itemsInCategory = this.allMenuItems[categoryName] || [];
        
        if (itemsInCategory.length > 0) {
            this.showModal({
                type: 'warning',
                title: 'Cannot Delete Category',
                message: `The category "${categoryName}" contains ${itemsInCategory.length} menu items. Please move or delete these items first before deleting the category.`,
                confirmText: 'OK',
                cancelText: '',
                onConfirm: () => this.hideModal()
            });
            // Hide cancel button
            document.getElementById('modal-cancel').style.display = 'none';
            return;
        }

        this.showModal({
            type: 'warning',
            title: 'Delete Category',
            message: `Are you sure you want to delete the "${categoryName}" category? This action cannot be undone.`,
            confirmText: 'Delete Category',
            cancelText: 'Cancel',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, `restaurants/${this.restaurantId}/categories`, categoryId));
                    
                    this.hideModal();
                    setTimeout(() => {
                        this.showSuccessModal(`Category "${categoryName}" has been deleted successfully.`);
                    }, 300);
                    
                } catch (error) {
                    console.error('❌ Error deleting category:', error);
                    this.hideModal();
                    setTimeout(() => {
                        this.showErrorModal('Failed to delete category. Please try again.');
                    }, 300);
                }
            }
        });
    }

    getFormData() {
        const name = document.getElementById('item-name').value.trim();
        const description = document.getElementById('item-description').value.trim();
        const price = parseInt(document.getElementById('item-price').value);
        const category = document.getElementById('item-category').value;
        const isRecommended = document.getElementById('is-recommended').checked;
        const isBestseller = document.getElementById('is-bestseller').checked;
        const isNew = document.getElementById('is-new').checked;
        const isSpicy = document.getElementById('is-spicy').checked;
        const isVegetarian = document.getElementById('is-vegetarian').checked;
        const displayPriority = parseInt(document.getElementById('display-priority').value);

        if (!name || !description || !price || !category) {
            this.showErrorModal('Please fill in all required fields including selecting a category.');
            return null;
        }

        return {
            name,
            description,
            price,
            category,
            available: true,
            isRecommended,
            isBestseller,
            isNew,
            isSpicy,
            isVegetarian,
            displayPriority
        };
    }

    async addMenuItem() {
        const itemData = this.getFormData();
        if (!itemData) return;

        this.setLoadingState(true);

        try {
            let imageUrl = null;
            
            if (this.selectedImage) {
                console.log('📸 Uploading image for:', itemData.name);
                imageUrl = await this.uploadImage(this.selectedImage, itemData.name);
            }

            const newItem = {
                ...itemData,
                imageUrl: imageUrl,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            console.log('📝 Adding menu item:', newItem);
            const docRef = await addDoc(this.menuRef, newItem);
            console.log('✅ Menu item added successfully with ID:', docRef.id);
            
            this.clearForm();
            this.showSuccessModal(`"${itemData.name}" has been added to your menu successfully!`);
            
        } catch (error) {
            console.error('❌ Error adding menu item:', error);
            this.showErrorModal(`Failed to add "${itemData.name}" to your menu. Please try again.`);
        } finally {
            this.setLoadingState(false);
        }
    }

    async updateMenuItem() {
        const itemData = this.getFormData();
        if (!itemData || !this.editingItemId) return;

        this.setLoadingState(true);

        try {
            let imageUrl = null;
            
            if (this.selectedImage) {
                console.log('📸 Uploading new image for:', itemData.name);
                imageUrl = await this.uploadImage(this.selectedImage, itemData.name);
            }

            const updateData = {
                ...itemData,
                updatedAt: new Date()
            };

            if (imageUrl) {
                updateData.imageUrl = imageUrl;
            }

            console.log('📝 Updating menu item:', this.editingItemId);
            const itemDoc = doc(db, `restaurants/${this.restaurantId}/menu_items`, this.editingItemId);
            await updateDoc(itemDoc, updateData);
            console.log('✅ Menu item updated successfully');
            
            this.cancelEdit();
            this.showSuccessModal(`"${itemData.name}" has been updated successfully!`);
            
        } catch (error) {
            console.error('❌ Error updating menu item:', error);
            this.showErrorModal(`Failed to update "${itemData.name}". Please try again.`);
        } finally {
            this.setLoadingState(false);
        }
    }

    editItem(itemId) {
        const item = Object.values(this.allMenuItems).flat().find(i => i.id === itemId);
        if (!item) return;

        console.log('✏️ Editing item:', item.name);

        // Fill form with existing data
        document.getElementById('item-name').value = item.name || '';
        document.getElementById('item-description').value = item.description || '';
        document.getElementById('item-price').value = item.price || '';
        document.getElementById('item-category').value = item.category || '';
        document.getElementById('is-recommended').checked = item.isRecommended || false;
        document.getElementById('is-bestseller').checked = item.isBestseller || false;
        document.getElementById('is-new').checked = item.isNew || false;
        document.getElementById('is-spicy').checked = item.isSpicy || false;
        document.getElementById('is-vegetarian').checked = item.isVegetarian || false;
        document.getElementById('display-priority').value = item.displayPriority || 5;
        document.getElementById('priority-value').textContent = item.displayPriority || 5;

        // Show existing image if available
        if (item.imageUrl) {
            document.getElementById('image-preview').innerHTML = 
                `<img src="${item.imageUrl}" alt="${item.name}">`;
        }

        // Update UI for editing mode
        this.editingItemId = itemId;
        document.getElementById('form-title').textContent = '✏️ Edit Menu Item';
        document.getElementById('btn-text').textContent = 'Update Item';
        document.getElementById('cancel-edit-btn').style.display = 'inline-block';
        document.getElementById('edit-item-id').value = itemId;

        // Scroll to form
        document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.editingItemId = null;
        document.getElementById('form-title').textContent = '✨ Add New Menu Item';
        document.getElementById('btn-text').textContent = 'Add Item to Menu';
        document.getElementById('cancel-edit-btn').style.display = 'none';
        document.getElementById('edit-item-id').value = '';
        this.clearForm();
    }

    setView(view) {
        this.currentView = view;
        
        // Update active button
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        // Re-display items with new filter
        this.displayMenuItems(this.allMenuItems);
    }

    async toggleAllAvailability(available) {
        const action = available ? 'available' : 'unavailable';
        const itemCount = Object.values(this.allMenuItems).flat().length;
        
        this.showModal({
            type: 'info',
            title: `Mark All Items ${action.charAt(0).toUpperCase() + action.slice(1)}`,
            message: `This will mark all ${itemCount} menu items as ${action}. Are you sure you want to continue?`,
            confirmText: `Mark All ${action.charAt(0).toUpperCase() + action.slice(1)}`,
            cancelText: 'Cancel',
            onConfirm: async () => {
                try {
                    const batch = writeBatch(db);
                    const allItems = Object.values(this.allMenuItems).flat();
                    
                    allItems.forEach(item => {
                        const itemDoc = doc(db, `restaurants/${this.restaurantId}/menu_items`, item.id);
                        batch.update(itemDoc, { 
                            available: available,
                            updatedAt: new Date()
                        });
                    });
                    
                    await batch.commit();
                    console.log(`✅ All items marked as ${action}`);
                    
                    this.hideModal();
                    
                    setTimeout(() => {
                        this.showSuccessModal(`All ${itemCount} items have been marked as ${action}.`);
                    }, 300);
                    
                } catch (error) {
                    console.error('❌ Error updating all items:', error);
                    this.hideModal();
                    
                    setTimeout(() => {
                        this.showErrorModal('Failed to update all items. Please try again.');
                    }, 300);
                }
            }
        });
    }

    async clearAllRecommendations() {
        const recommendedItems = Object.values(this.allMenuItems).flat()
            .filter(item => item.isRecommended || item.isBestseller || item.isNew);
        
        if (recommendedItems.length === 0) {
            this.showErrorModal('No items have recommendation badges to clear.');
            return;
        }
        
        this.showModal({
            type: 'warning',
            title: 'Clear All Recommendations',
            message: `This will remove recommendation badges from ${recommendedItems.length} items (Chef's Special, Best Seller, New Item). Continue?`,
            confirmText: 'Clear All Badges',
            cancelText: 'Keep Badges',
            onConfirm: async () => {
                try {
                    const batch = writeBatch(db);
                    const allItems = Object.values(this.allMenuItems).flat();
                    
                    allItems.forEach(item => {
                        const itemDoc = doc(db, `restaurants/${this.restaurantId}/menu_items`, item.id);
                        batch.update(itemDoc, { 
                            isRecommended: false,
                            isBestseller: false,
                            isNew: false,
                            updatedAt: new Date()
                        });
                    });
                    
                    await batch.commit();
                    console.log('✅ All recommendations cleared');
                    
                    this.hideModal();
                    
                    setTimeout(() => {
                        this.showSuccessModal(`All recommendation badges have been cleared from ${recommendedItems.length} items.`);
                    }, 300);
                    
                } catch (error) {
                    console.error('❌ Error clearing recommendations:', error);
                    this.hideModal();
                    
                    setTimeout(() => {
                        this.showErrorModal('Failed to clear recommendation badges. Please try again.');
                    }, 300);
                }
            }
        });
    }

    loadMenuItems() {
        console.log('👀 Setting up real-time listener for menu items...');
        
        onSnapshot(this.menuRef, (snapshot) => {
            console.log('🔄 Menu items snapshot received, count:', snapshot.size);
            
            this.allMenuItems = {};
            let totalItems = 0;
            let recommendedCount = 0;
            
            snapshot.forEach((doc) => {
                const item = { id: doc.id, ...doc.data() };
                
                if (!this.allMenuItems[item.category]) {
                    this.allMenuItems[item.category] = [];
                }
                this.allMenuItems[item.category].push(item);
                totalItems++;
                
                if (item.isRecommended || item.isBestseller || item.isNew) {
                    recommendedCount++;
                }
            });
            
            // Sort items by priority within each category
            Object.keys(this.allMenuItems).forEach(category => {
                this.allMenuItems[category].sort((a, b) => {
                    return (b.displayPriority || 5) - (a.displayPriority || 5);
                });
            });
            
            // Update stats
            const totalItemsEl = document.getElementById('total-items');
            const recommendedCountEl = document.getElementById('recommended-count');
            
            if (totalItemsEl) totalItemsEl.textContent = `${totalItems} items`;
            if (recommendedCountEl) recommendedCountEl.textContent = `${recommendedCount} recommended`;
            
            this.displayMenuItems(this.allMenuItems);
            this.displayCategories(); // Update category counts
            
        }, (error) => {
            console.error('❌ Error loading menu items:', error);
        });
    }

    displayMenuItems(menuItems) {
        const itemsList = document.getElementById('items-list');
        
        // Filter items based on current view
        let filteredItems = {};
        Object.keys(menuItems).forEach(category => {
            const categoryItems = menuItems[category].filter(item => {
                switch (this.currentView) {
                    case 'recommended':
                        return item.isRecommended || item.isBestseller || item.isNew;
                    case 'unavailable':
                        return !item.available;
                    default:
                        return true;
                }
            });
            
            if (categoryItems.length > 0) {
                filteredItems[category] = categoryItems;
            }
        });

        if (Object.keys(filteredItems).length === 0) {
            itemsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <p>📝 No items found for current filter.</p>
                    <p>Try switching views or add new items!</p>
                </div>
            `;
            return;
        }

        itemsList.innerHTML = '';

        Object.keys(filteredItems).sort().forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'category-section';
            
            const categoryHeader = document.createElement('h3');
            categoryHeader.textContent = `${category.toUpperCase()} (${filteredItems[category].length})`;
            categoryHeader.style.color = '#007bff';
            categoryHeader.style.marginBottom = '15px';
            categoryHeader.style.borderBottom = '2px solid #eee';
            categoryHeader.style.paddingBottom = '5px';
            categoryDiv.appendChild(categoryHeader);

            filteredItems[category].forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = `menu-item-admin ${item.isRecommended ? 'recommended' : ''} ${!item.available ? 'unavailable' : ''}`;
                
                const imageElement = item.imageUrl 
                    ? `<img src="${item.imageUrl}" alt="${item.name}" class="menu-item-image">`
                    : `<div class="no-image-placeholder">No Image</div>`;
                
                const badges = [];
                if (item.isRecommended) badges.push('<span class="badge recommended">Chef\'s Special</span>');
                if (item.isBestseller) badges.push('<span class="badge bestseller">Best Seller</span>');
                if (item.isNew) badges.push('<span class="badge new">New</span>');
                if (item.isSpicy) badges.push('<span class="badge spicy">🌶️ Spicy</span>');
                if (item.isVegetarian) badges.push('<span class="badge vegetarian">🥬 Veg</span>');
                
                const badgesHtml = badges.length > 0 ? 
                    `<div class="item-badges">${badges.join('')}</div>` : '';
                
                const priorityIndicator = (item.displayPriority || 5) > 5 ? 
                    `<div class="priority-indicator">${item.displayPriority}</div>` : '';
                
                itemDiv.innerHTML = `
                    ${priorityIndicator}
                    ${badgesHtml}
                    ${imageElement}
                    <div class="item-details">
                        <h4 style="margin-bottom: 5px; color: #333;">${item.name}</h4>
                        <p style="color: #666; margin-bottom: 8px;">${item.description}</p>
                        <span class="price" style="font-weight: bold; color: #28a745; font-size: 18px;">₹${item.price}</span>
                        <span style="margin-left: 10px; font-size: 12px; color: ${item.available ? '#28a745' : '#dc3545'};">
                            ${item.available ? '✅ Available' : '❌ Not Available'}
                        </span>
                    </div>
                    <div class="item-actions">
                        <button onclick="adminPanel.editItem('${item.id}')" class="edit-btn">
                            ✏️ Edit
                        </button>
                        <button onclick="adminPanel.toggleAvailability('${item.id}', ${!item.available})" 
                                class="toggle-btn">
                            ${item.available ? 'Mark Unavailable' : 'Mark Available'}
                        </button>
                        <button onclick="adminPanel.deleteItem('${item.id}', '${item.name}')" class="delete-btn">
                            🗑️ Delete
                        </button>
                    </div>
                `;
                categoryDiv.appendChild(itemDiv);
            });

            itemsList.appendChild(categoryDiv);
        });
    }

    async toggleAvailability(itemId, newAvailability) {
        try {
            const itemDoc = doc(db, `restaurants/${this.restaurantId}/menu_items`, itemId);
            await updateDoc(itemDoc, { 
                available: newAvailability,
                updatedAt: new Date()
            });
            console.log('✅ Item availability updated');
        } catch (error) {
            console.error('❌ Error updating availability:', error);
            this.showErrorModal('Failed to update item availability. Please try again.');
        }
    }

    async deleteItem(itemId, itemName) {
        this.showModal({
            type: 'warning',
            title: 'Delete Menu Item',
            message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
            confirmText: 'Delete Item',
            cancelText: 'Keep Item',
            onConfirm: async () => {
                try {
                    console.log('🗑️ Deleting item:', itemId);
                    await deleteDoc(doc(db, `restaurants/${this.restaurantId}/menu_items`, itemId));
                    console.log('✅ Item deleted successfully');
                    
                    this.hideModal();
                    
                    setTimeout(() => {
                        this.showSuccessModal(`"${itemName}" has been successfully deleted from your menu.`);
                    }, 300);
                    
                } catch (error) {
                    console.error('❌ Error deleting item:', error);
                    this.hideModal();
                    
                    setTimeout(() => {
                        this.showErrorModal(`Failed to delete "${itemName}". Please try again.`);
                    }, 300);
                }
            }
        });
    }

    setLoadingState(loading) {
        const form = document.getElementById('add-item-form');
        const addButton = document.getElementById('add-item-btn');
        
        if (loading) {
            form.classList.add('uploading');
            addButton.disabled = true;
        } else {
            form.classList.remove('uploading');
            addButton.disabled = false;
        }
    }

    clearForm() {
        document.getElementById('add-item-form').reset();
        document.getElementById('image-preview').innerHTML = '<p>No image selected</p>';
        document.getElementById('priority-value').textContent = '5';
        this.selectedImage = null;
    }

    // Legacy method for backwards compatibility
    showSuccessMessage(message) {
        this.showSuccessModal(message);
    }
}

// Initialize the admin panel
const adminPanel = new AdminPanel();

// Make adminPanel globally accessible for button clicks in HTML
window.adminPanel = adminPanel;

console.log('🚀 Enhanced admin panel loaded with all features!');