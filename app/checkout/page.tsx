'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './checkout.module.css';

// Loading fallback component
function CheckoutLoading() {
  return (
    <div className={styles["checkout-container"]}>
      <div className={styles["checkout-header"]}>
        <h1>Loading checkout...</h1>
      </div>
    </div>
  );
}

// Component that uses searchParams
function CheckoutContent() {
  const searchParams = useSearchParams();
  const [cartTotal, setCartTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    shippingMethod: 'standard'
  });

  useEffect(() => {
    // Get cart total from URL params
    const total = searchParams.get('total');
    if (total) {
      const parsedTotal = parseFloat(total);
      if (!isNaN(parsedTotal)) {
        setCartTotal(parsedTotal);
      } else {
        setError('Invalid cart total provided');
      }
    } else {
      setError('No cart total provided');
    }
  }, [searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const getShippingCost = () => {
    return formData.shippingMethod === 'priority' ? 50 : 10;
  };

  const getTotalWithShipping = () => {
    if (cartTotal === null) return 0;
    return cartTotal + getShippingCost();
  };

  const handlePayment = async (token: 'SOL' | 'DADDY') => {
    if (cartTotal === null) {
      setError('Cart total is missing');
      return;
    }

    setLoading(true);
    setError(null);
    // Reset payment URL when starting a new payment
    setPaymentUrl(null);
    setPaymentReference(null);
    setPaymentToken(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          cartTotal,
          token
        })
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else if (data.url) {
        // Set the payment URL and reference
        setPaymentUrl(data.url);
        setPaymentReference(data.reference);
        setPaymentToken(data.tokenUsed);
        
        // Also open in a new window for convenience
        window.open(data.url, '_blank');
      }
    } catch (err) {
      setError('Failed to process payment. Please try again.');
      console.error('Payment error:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (urlInputRef.current) {
      urlInputRef.current.select();
      document.execCommand('copy');
      alert('Payment URL copied to clipboard!');
    }
  };

  if (error && !cartTotal) {
    return (
      <div className={styles["error-container"]}>
        <div className={styles["error-box"]}>
          <h2>Error</h2>
          <p>{error}</p>
          <p>Please return to the store and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles["checkout-container"]}>
      <div className={styles["checkout-header"]}>
        <h1>Complete Your Purchase</h1>
      </div>

      <div className={styles["checkout-content"]}>
        <div className={styles["checkout-form"]}>
          <h2>Shipping Information</h2>
          
          <div className={styles["form-row"]}>
            <div className={styles["form-group"]}>
              <label htmlFor="firstName">First Name*</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className={styles["form-group"]}>
              <label htmlFor="lastName">Last Name*</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className={styles["form-row"]}>
            <div className={`${styles["form-group"]} ${styles["full-width"]}`}>
              <label htmlFor="email">Email*</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className={styles["form-row"]}>
            <div className={`${styles["form-group"]} ${styles["full-width"]}`}>
              <label htmlFor="phoneNumber">Phone Number (Optional)</label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className={styles["form-row"]}>
            <div className={`${styles["form-group"]} ${styles["full-width"]}`}>
              <label htmlFor="addressLine1">Address Line 1*</label>
              <input
                type="text"
                id="addressLine1"
                name="addressLine1"
                value={formData.addressLine1}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className={styles["form-row"]}>
            <div className={`${styles["form-group"]} ${styles["full-width"]}`}>
              <label htmlFor="addressLine2">Address Line 2 (Optional)</label>
              <input
                type="text"
                id="addressLine2"
                name="addressLine2"
                value={formData.addressLine2}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className={styles["form-row"]}>
            <div className={styles["form-group"]}>
              <label htmlFor="city">City*</label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className={styles["form-group"]}>
              <label htmlFor="state">State/Province*</label>
              <input
                type="text"
                id="state"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className={styles["form-row"]}>
            <div className={styles["form-group"]}>
              <label htmlFor="zipCode">ZIP/Postal Code*</label>
              <input
                type="text"
                id="zipCode"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className={styles["form-group"]}>
              <label htmlFor="country">Country*</label>
              <input
                type="text"
                id="country"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <h2>Shipping Method</h2>
          <div className={styles["shipping-options"]}>
            <div className={styles["shipping-option"]}>
              <input
                type="radio"
                id="standard"
                name="shippingMethod"
                value="standard"
                checked={formData.shippingMethod === 'standard'}
                onChange={handleInputChange}
              />
              <label htmlFor="standard" className={styles["radio-label"]}>
                <div className={styles["shipping-option-details"]}>
                  <span className={styles["shipping-name"]}>Standard Shipping</span>
                  <span className={styles["shipping-price"]}>$10.00</span>
                </div>
                <span className={styles["shipping-description"]}>5-7 business days</span>
              </label>
            </div>

            <div className={styles["shipping-option"]}>
              <input
                type="radio"
                id="priority"
                name="shippingMethod"
                value="priority"
                checked={formData.shippingMethod === 'priority'}
                onChange={handleInputChange}
              />
              <label htmlFor="priority" className={styles["radio-label"]}>
                <div className={styles["shipping-option-details"]}>
                  <span className={styles["shipping-name"]}>Priority Shipping</span>
                  <span className={styles["shipping-price"]}>$50.00</span>
                </div>
                <span className={styles["shipping-description"]}>2-3 business days</span>
              </label>
            </div>
          </div>
        </div>

        <div className={styles["checkout-summary"]}>
          <h2>Order Summary</h2>
          <div className={styles["summary-row"]}>
            <span>Subtotal</span>
            <span>${cartTotal?.toFixed(2) || '0.00'}</span>
          </div>
          <div className={styles["summary-row"]}>
            <span>Shipping</span>
            <span>${getShippingCost().toFixed(2)}</span>
          </div>
          <div className={`${styles["summary-row"]} ${styles["total"]}`}>
            <span>Total</span>
            <span>${getTotalWithShipping().toFixed(2)}</span>
          </div>

          {error && <div className={styles["error-message"]}>{error}</div>}

          {!paymentUrl ? (
            <div className={styles["payment-methods"]}>
              <button
                className={`${styles["pay-button"]} ${styles["sol-button"]}`}
                onClick={() => handlePayment('SOL')}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Pay with SOL'}
              </button>
              <button
                className={`${styles["pay-button"]} ${styles["daddy-button"]}`}
                onClick={() => handlePayment('DADDY')}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Pay with DADDY'}
              </button>
            </div>
          ) : (
            <div className={styles["payment-url-container"]}>
              <h3>Your Payment URL</h3>
              <p>Please complete your payment using the link below. Transaction will be monitored automatically.</p>
              
              <div className={styles["payment-url-box"]}>
                <input 
                  type="text" 
                  ref={urlInputRef} 
                  readOnly 
                  value={paymentUrl} 
                  className={styles["payment-url-input"]}
                />
                <button onClick={copyToClipboard} className={styles["copy-button"]}>
                  Copy
                </button>
              </div>
              
              <div className={styles["payment-details"]}>
                <p><strong>Payment Reference:</strong> {paymentReference}</p>
                <p><strong>Token Type:</strong> {paymentToken}</p>
                <p className={styles["payment-instructions"]}>
                  Open this URL in a wallet that supports Solana Pay to complete your payment. 
                  Your order status will be updated automatically once payment is confirmed.
                </p>
                <button 
                  className={styles["open-url-button"]} 
                  onClick={() => window.open(paymentUrl, '_blank')}
                >
                  Open in Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main checkout page component with Suspense
export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutContent />
    </Suspense>
  );
}
