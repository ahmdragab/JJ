#!/usr/bin/env python3
"""
Scrape all .avif images from https://www.magier.com/ad-examples
Handles infinite scrolling to load all images.
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import sys

def scrape_avif_images():
    """Scrape all .avif images from the magier ad examples page."""
    
    # Initialize the driver (using Chrome - you can change to Firefox if needed)
    print("Initializing browser...")
    try:
        driver = webdriver.Chrome()
    except Exception as e:
        print(f"Chrome driver not found. Trying Firefox...")
        try:
            driver = webdriver.Firefox()
        except Exception as e2:
            print(f"Error: Could not initialize browser driver. {e2}")
            print("Please install ChromeDriver or GeckoDriver, or use webdriver-manager")
            sys.exit(1)
    
    try:
        url = "https://www.magier.com/ad-examples"
        print(f"Loading page: {url}")
        driver.get(url)
        
        # Wait for page to load
        time.sleep(3)
        
        # Set to track unique image URLs
        image_urls = set()
        last_count = 0
        scroll_attempts = 0
        max_scroll_attempts = 100  # Prevent infinite loops
        no_new_images_threshold = 3  # Stop if no new images found after N scrolls
        
        print("Starting infinite scroll to load all images...")
        
        while scroll_attempts < max_scroll_attempts:
            # Scroll to bottom
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)  # Wait for content to load
            
            # Find all img elements with .avif in their src
            images = driver.find_elements(By.TAG_NAME, "img")
            
            # Extract .avif image URLs
            for img in images:
                src = img.get_attribute("src")
                if src and ".avif" in src:
                    image_urls.add(src)
            
            # Also check for background images in style attributes
            elements_with_bg = driver.find_elements(By.XPATH, "//*[@style]")
            for elem in elements_with_bg:
                style = elem.get_attribute("style")
                if style and ".avif" in style:
                    # Extract URL from background-image style
                    import re
                    urls = re.findall(r'url\(["\']?([^"\']+\.avif[^"\']*)["\']?\)', style)
                    for url in urls:
                        image_urls.add(url)
            
            current_count = len(image_urls)
            
            # Print progress
            if current_count > last_count:
                print(f"Found {current_count} unique .avif images so far...")
                last_count = current_count
                scroll_attempts = 0  # Reset counter when new images found
            else:
                scroll_attempts += 1
                if scroll_attempts >= no_new_images_threshold:
                    print(f"No new images found after {no_new_images_threshold} scrolls. Stopping...")
                    break
            
            # Check if we've reached the bottom (optional - can help detect end of scroll)
            scroll_position = driver.execute_script("return window.pageYOffset;")
            page_height = driver.execute_script("return document.body.scrollHeight;")
            window_height = driver.execute_script("return window.innerHeight;")
            
            if scroll_position + window_height >= page_height - 10:
                # We're at the bottom, try one more scroll to be sure
                time.sleep(1)
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
        
        print(f"\n{'='*60}")
        print(f"Total unique .avif images found: {len(image_urls)}")
        print(f"{'='*60}\n")
        
        # Print all image URLs
        for i, url in enumerate(sorted(image_urls), 1):
            print(f"{i}. {url}")
        
        return list(image_urls)
        
    except Exception as e:
        print(f"Error occurred: {e}")
        import traceback
        traceback.print_exc()
        return []
    
    finally:
        print("\nClosing browser...")
        driver.quit()

if __name__ == "__main__":
    scrape_avif_images()


