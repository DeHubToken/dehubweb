

# Location-Based Radio Station Search

## Overview
Enhance the radio search to automatically detect when users type a country name or country code (like "US", "UK", "Germany") and return stations from that location. The Radio Browser API supports advanced search with multiple filters including `country`, `countrycode`, `name`, and more.

## How It Will Work
When a user types in the search box:
- **"US"** or **"United States"** → Shows all radio stations from the USA
- **"UK"** or **"United Kingdom"** → Shows all British stations
- **"jazz US"** → Shows jazz stations from the USA (name + country combined)
- **"rock germany"** → Shows rock stations from Germany

## Implementation

### 1. Add Country Data Mapping
Create a mapping of common country codes and names for smart detection:

```text
US → United States
UK → United Kingdom / Great Britain  
DE → Germany
FR → France
JP → Japan
... etc
```

### 2. Update Radio Browser API (`src/lib/api/radio-browser.ts`)

**Add new advanced search function:**
- Use the `/stations/search` endpoint which supports multiple filter parameters
- Accept optional `countrycode` and `country` parameters
- Parse user input to detect country codes (2-letter uppercase) or country names

**New function signature:**
```text
searchStationsAdvanced({
  name?: string,
  country?: string, 
  countrycode?: string,
  limit?: number
}) → RadioStation[]
```

### 3. Add Smart Query Parser
A utility function that analyzes the search query and extracts:
- Country code if detected (e.g., "US", "JP")
- Country name if detected (e.g., "Germany", "Brazil")
- Remaining text as station name search

**Example parsing:**
```text
Input: "jazz US"
Output: { name: "jazz", countrycode: "US" }

Input: "Germany"  
Output: { country: "Germany" }

Input: "radio london"
Output: { name: "radio london" }
```

### 4. Update RadioSection Component (`src/components/app/radio/RadioSection.tsx`)

- Replace the basic `searchStations` call with the new advanced search
- Pass parsed query parameters to the API
- Update the "Results for" header to show detected filters (e.g., "Results for jazz in US")

## Technical Details

### Country Code Detection
- Check if any word in the query matches a known 2-letter ISO country code
- Common codes: US, UK, DE, FR, JP, BR, IN, AU, CA, ES, IT, NL, SE, etc.

### API Endpoint Used
```text
GET /stations/search?name={name}&countrycode={code}&hidebroken=true&order=votes&reverse=true&limit=50
```

### Files to Modify
1. **`src/lib/api/radio-browser.ts`** - Add country codes list, advanced search function, and query parser
2. **`src/components/app/radio/RadioSection.tsx`** - Use new advanced search with parsed query

## User Experience
- **No UI changes needed** - the search bar works the same way
- Users simply type what they want: "US pop", "Germany", "jazz UK"
- Results automatically filter by detected location
- Search results header shows what filters are active

