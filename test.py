# import requests
# import whois
# from bs4 import BeautifulSoup

# def fetch_website_details(domain):
#     details = {}

#     # Fetch WHOIS information
#     try:
#         domain_info = whois.whois(domain)
#         details['domain_name'] = domain_info.domain_name
#         details['registrar'] = domain_info.registrar
#         details['creation_date'] = domain_info.creation_date
#         details['expiration_date'] = domain_info.expiration_date
#         details['name_servers'] = domain_info.name_servers
#     except Exception as e:
#         details['whois_error'] = f"Error fetching WHOIS data: {str(e)}"

#     # Fetch HTTP details
#     try:
#         response = requests.get(f"http://{domain}", timeout=10)
#         details['http_status_code'] = response.status_code
#         details['headers'] = response.headers
#     except Exception as e:
#         details['http_error'] = f"Error fetching HTTP data: {str(e)}"

#     # Scrape website metadata
#     try:
#         if 'response' in locals() and response.status_code == 200:
#             soup = BeautifulSoup(response.text, 'html.parser')
#             details['title'] = soup.title.string if soup.title else "No title found"
#             details['meta_description'] = soup.find('meta', attrs={'name': 'description'})['content'] \
#                 if soup.find('meta', attrs={'name': 'description'}) else "No meta description found"
#             details['meta_keywords'] = soup.find('meta', attrs={'name': 'keywords'})['content'] \
#                 if soup.find('meta', attrs={'name': 'keywords'}) else "No meta keywords found"
#         else:
#             details['metadata_error'] = "Unable to scrape metadata due to HTTP error."
#     except Exception as e:
#         details['metadata_error'] = f"Error fetching metadata: {str(e)}"

#     return details

# # Example usage
# if __name__ == "__main__":
#     domain = input("Enter a domain (e.g., example.com): ")
#     website_details = fetch_website_details(domain)
#     print("Website Details:")
#     for key, value in website_details.items():
#         print(f"{key}: {value}")


# import whois
# from itertools import product

# def check_domain_availability(domain):
#     try:
#         domain_info = whois.whois(domain)
#         if domain_info.status:
#             return False  # Domain is registered
#     except Exception:
#         return True  # Domain is available

# def generate_domains(length, charset):
#     for size in range(3, length + 1):
#         for combination in product(charset, repeat=size):
#             yield ''.join(combination) + ".com"

# def find_available_domains(max_length=7, charset="abcdefghijklmnopqrstuvwxyz"):
#     available_domains = []
#     print("Searching for available domains. This may take a while...")
    
#     for index, domain in enumerate(generate_domains(max_length, charset)):
#         if check_domain_availability(domain):
#             print(f"Available: {domain}")
#             available_domains.append(domain)
#         else:
#             print(f"Failed: {domain} at index {index}")
    
#     return available_domains


# if __name__ == "__main__":
#     max_length = 7
#     charset = "abcdefghijklmnopqrstuvwxyz"  # Add digits if needed
#     available = find_available_domains(max_length, charset)
#     print(f"Found {len(available)} available domains:")
#     for domain in available:
#         print(domain)


import requests
from bs4 import BeautifulSoup
import whois

def get_website_details(url):
    details = {}

    # Get WHOIS information
    try:
        domain_info = whois.whois(url)
        details['domain_name'] = domain_info.domain_name
        details['registrar'] = domain_info.registrar
        details['creation_date'] = domain_info.creation_date
        details['expiration_date'] = domain_info.expiration_date
    except Exception:
        details['whois'] = 'Could not retrieve WHOIS information.'

    # Get metadata
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        details['title'] = soup.title.string if soup.title else 'No title found'
        details['description'] = soup.find('meta', attrs={'name': 'description'})['content'] \
            if soup.find('meta', attrs={'name': 'description'}) else 'No description found'
    except Exception:
        details['metadata'] = 'Could not retrieve metadata.'

    return details

print(get_website_details('https://youtube.com/'))
