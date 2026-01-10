import { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, Package, Check, Plus, Link, ExternalLink, Trash2 } from 'lucide-react';
import { Product, supabase, getAuthHeaders } from '../lib/supabase';
import { useToast } from './Toast';
import { Button } from './ui';

interface ProductPickerProps {
  brandId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: Product | null) => void;
  selectedProduct: Product | null;
}

export function ProductPicker({
  brandId,
  isOpen,
  onClose,
  onSelect,
  selectedProduct,
}: ProductPickerProps) {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch products
  useEffect(() => {
    if (!isOpen) return;

    const fetchProducts = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setProducts(data as Product[]);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [brandId, isOpen]);

  // Filter products by search
  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.category && product.category.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Handle scraping a new product
  const handleScrapeProduct = async () => {
    if (!productUrl.trim()) {
      toast.error('Please enter a product URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(productUrl.startsWith('http') ? productUrl : `https://${productUrl}`);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setScraping(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-product`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            productUrl: productUrl.trim(),
            brandId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to scrape product');
      }

      // Add new product to list and select it
      const newProduct = data.product as Product;
      setProducts(prev => [newProduct, ...prev]);
      onSelect(newProduct);
      setProductUrl('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Scrape error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to scrape product');
    } finally {
      setScraping(false);
    }
  };

  // Handle delete product
  const handleDeleteProduct = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(product.id);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;

      setProducts(prev => prev.filter(p => p.id !== product.id));

      // Deselect if this was the selected product
      if (selectedProduct?.id === product.id) {
        onSelect(null);
      }

      toast.success('Product deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete product');
    } finally {
      setDeletingId(null);
    }
  };

  // Format price display
  const formatPrice = (product: Product) => {
    if (!product.price) return null;
    const currency = product.currency || 'USD';
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
    return `${symbol}${product.price.toFixed(2)}`;
  };

  // Get primary image
  const getPrimaryImage = (product: Product) => {
    if (!product.images || product.images.length === 0) return null;
    const primary = product.images.find(img => img.is_primary);
    return primary?.url || product.images[0]?.url;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-enter"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal Content */}
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-start sm:items-center justify-between p-4 sm:p-6 gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-800 mb-1 font-heading">Products</h2>
            <p className="text-xs sm:text-sm text-neutral-500">
              {selectedProduct
                ? `Selected: ${selectedProduct.name}`
                : `${products.length} product${products.length !== 1 ? 's' : ''} • Select one to feature in your ad`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Add Bar */}
        <div className="flex-shrink-0 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {showAddForm ? (
              /* Add Product Form - Expands to full width */
              <div className="flex gap-2 flex-1 animate-in fade-in slide-in-from-right-2 duration-200">
                <div className="relative flex-1">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    ref={inputRef}
                    type="url"
                    placeholder="Paste product URL..."
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScrapeProduct()}
                    className="input pl-10 py-2.5 text-sm w-full"
                    disabled={scraping}
                    autoFocus
                  />
                </div>
                <Button
                  onClick={handleScrapeProduct}
                  disabled={scraping || !productUrl.trim()}
                  size="md"
                  className="shrink-0"
                >
                  {scraping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </Button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setProductUrl('');
                  }}
                  className="w-10 h-10 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
                  disabled={scraping}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Search + Add Button */
              <>
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products..."
                    className="input pl-10 py-2.5 text-sm"
                  />
                </div>
                <Button
                  onClick={() => setShowAddForm(true)}
                  size="md"
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span className="ml-1.5">Add Product</span>
                </Button>
              </>
            )}
          </div>
          {scraping && (
            <p className="mt-2 text-xs text-neutral-500">
              Extracting product details... This may take a few seconds.
            </p>
          )}
        </div>

        {/* Products Grid */}
        <div className="overflow-y-auto p-3 sm:p-4 md:p-6 no-scrollbar max-h-[calc(95vh-280px)] sm:max-h-[calc(90vh-260px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-500 mb-4">
                {searchQuery ? 'No products match your search' : 'No products yet'}
              </p>
              {!searchQuery && (
                <Button
                  onClick={() => setShowAddForm(true)}
                  variant="secondary"
                  size="md"
                >
                  <Plus className="w-4 h-4" />
                  <span className="ml-1.5">Add Your First Product</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {filteredProducts.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                const imageUrl = getPrimaryImage(product);
                const price = formatPrice(product);

                return (
                  <div
                    key={product.id}
                    onClick={() => onSelect(isSelected ? null : product)}
                    className={`
                      relative group cursor-pointer rounded-xl overflow-hidden border transition-all
                      ${isSelected
                        ? 'border-brand-primary ring-1 ring-brand-primary/20'
                        : 'border-neutral-200 hover:border-neutral-300'
                      }
                    `}
                  >
                    {/* Image */}
                    <div className="aspect-square bg-neutral-100 relative">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-neutral-300" />
                        </div>
                      )}

                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteProduct(product, e)}
                        className="absolute top-2 left-2 p-1.5 bg-white/90 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                        disabled={deletingId === product.id}
                      >
                        {deletingId === product.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-neutral-500 hover:text-red-500" />
                        )}
                      </button>

                      {/* Source link */}
                      <a
                        href={product.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-2 right-2 p-1.5 bg-white/90 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-100"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
                      </a>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-sm text-neutral-800 line-clamp-2 leading-tight">
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between mt-1.5">
                        {price && (
                          <span className="text-sm font-semibold text-neutral-800">
                            {price}
                          </span>
                        )}
                        {product.category && (
                          <span className="text-xs text-neutral-500 truncate ml-2">
                            {product.category}
                          </span>
                        )}
                      </div>
                      {product.status === 'enriched' && product.key_features && product.key_features.length > 0 && (
                        <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                          {product.key_features[0]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 sm:p-5 border-t border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-sm text-neutral-500 min-w-0 flex-1">
            {selectedProduct ? (
              <span className="flex items-center gap-2 min-w-0">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="truncate">
                  Selected: <strong className="text-neutral-700">{selectedProduct.name}</strong>
                </span>
              </span>
            ) : (
              'Click a product to select it'
            )}
          </div>
          <div className="flex gap-3 shrink-0">
            <Button
              onClick={onClose}
              variant="ghost"
              size="md"
              className="flex-1 sm:flex-none border border-neutral-200"
            >
              Cancel
            </Button>
            <Button
              onClick={onClose}
              disabled={!selectedProduct}
              size="md"
              className="flex-1 sm:flex-none"
            >
              Confirm Selection
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
