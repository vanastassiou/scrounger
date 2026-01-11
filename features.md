# Thrift Sourcing App Specification

## Overview

This specification describes a web application for managing vintage clothing, shoes, and jewelry sourcing from thrift stores in Metro Vancouver through the Fraser Valley, BC. The app supports both personal collection building and resale operations.

## User Profile

- **Location**: New Westminster, BC
- **Focus**: Vintage clothing (pre-1990s and 1990s/Y2K), shoes, and jewelry (fine and quality costume)
- **Measurements**: 43" bust, 35" waist, 45" hips, size 10.5/41EU shoes (tall frame)
- **Time budget**: 4-5 hours/week for sourcing
- **Schedule flexibility**: Weekday daytime available
- **Transport**: Personal vehicle
- **Intent**: Both personal wardrobe building and resale

## Core Features Required

### 1. Store Management
- Database of thrift stores with addresses, hours, chain affiliation, quality tier
- Geographic clustering for route planning
- Visit logging with date, time, duration, purchases
- Store-level analytics (hit rate, average spend, best days)
- Priority scoring based on days since last visit and store tier

### 2. Rotation Scheduling
- Recommended visit frequency by store tier
- Priority queue of stores to visit based on rotation logic
- Trip planning with geographic clustering
- Time estimates per store type (jewelry scan vs deep dive)
- Calendar integration or simple scheduling view

### 3. Inventory Management
- Per-item entry form with comprehensive fields
- Quality scoring checklist for in-store evaluation
- Photo attachment capability
- Cost basis tracking (purchase price, repairs, tax)
- Resale pricing with comp research
- Sales tracking with profit/loss calculation

### 4. Reference Databases (JSON-based)
- Brand recognition with tier classification and premium multipliers
- Material identification guide
- Hallmark database for jewelry authentication
- Quality scoring criteria by category

### 5. Trip Analytics
- Cost per hour sourcing
- Revenue per hour sourcing
- Best performing stores/clusters
- Optimal visit patterns

## Data Architecture

All data should be stored in JSON files to minimize compute costs. The app should be designed to work efficiently with file-based storage.

### Provided JSON Datasets

1. **rotation-logic.json** - Business rules for visit scheduling, priority scoring, time allocation, and trip planning heuristics

2. **stores.json** - Store database with ~30 stores including:
   - Value Village locations (Metro Van to Chilliwack)
   - Salvation Army locations
   - MCC (Mennonite Central Committee) thrifts
   - Hospital auxiliary thrift shops (highest jewelry potential)
   - Geographic clustering and recommended rotations

3. **brands-clothing-shoes.json** - Tiered brand valuation:
   - Tier S (designer): Chanel, Hermès, Gucci, etc.
   - Tier A (quality contemporary): Max Mara, Theory, Aritzia, etc.
   - Tier Vintage (collectible labels): Ossie Clark, Biba, etc.
   - Tier B (solid resale): Ann Taylor, Zara, etc.
   - Denim and athletic/streetwear sections

4. **brands-jewelry-hallmarks.json** - Jewelry identification:
   - Fine jewelry houses (Cartier, Tiffany, etc.)
   - Designer fashion jewelry
   - Vintage costume collectibles (Miriam Haskell, Eisenberg, etc.)
   - Comprehensive hallmark database by country
   - Testing procedures and fake detection

5. **materials.json** - Material quality identification:
   - Premium natural fibers (silk, cashmere, wool, linen)
   - Leather grades and quality tests
   - Jewelry metals and purity marks
   - Gemstone identification basics

6. **inventory-form-schema.json** - Item data structure:
   - Acquisition tracking
   - Item identification fields by category
   - Sizing and measurements
   - Condition assessment with flaw tracking
   - Quality scoring checklists
   - Pricing and sales tracking

## Technical Preferences

- Mobile-responsive design (primary use will be in-store on phone)
- Offline capability important (cell signal unreliable in some stores)
- Simple, fast interface for quick data entry
- Photo capture integration
- Search and filter capabilities across inventory

## Implementation Priorities

1. **Phase 1**: Store database browser and visit logging
2. **Phase 2**: Inventory management with form entry
3. **Phase 3**: Rotation scheduling and priority queue
4. **Phase 4**: Analytics and reporting
5. **Phase 5**: Reference database browsing (brands, hallmarks, materials)

## Notes for Implementation

- The user already has a framework set up; focus on business logic implementation
- Hallmark reference should support quick lookup by mark characteristics
- Quality scoring should be implementable as checkboxes during in-store evaluation
- Brand lookup should support partial matching and fuzzy search
- Consider progressive loading for large datasets
- Store hours are estimates and should be flagged as "verify before visiting"
- Some stores (especially hospital auxiliaries) have limited, volunteer-dependent hours

## File Structure

```
/data/
  stores.json
  rotation-logic.json
  brands-clothing-shoes.json
  brands-jewelry-hallmarks.json
  materials.json
  inventory-form-schema.json
/user-data/
  visits.json           # User's visit history
  inventory.json        # User's item inventory
  settings.json         # User preferences
```

## Success Metrics

- Reduced time spent deciding where to shop
- Improved hit rate (purchases per visit)
- Better profit margins through informed pricing
- Comprehensive inventory tracking
- Ability to quickly identify valuable items in-store using reference data
