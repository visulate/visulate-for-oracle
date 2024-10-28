* TOC
{:toc id="toc"}

# Catalog an Oracle E-Business Suite Database Instance

E-Business Suite databases place code objects like PL/SQL packages and procedures in a single database schema called APPS. Data object like tables and indexes are distributed into product schemas.

Each database has a huge number of objects. For example version 12.2 of the E-Business Suite has around 290 product schemas and over 52,000 PL/SQL packages in the APPS schema. Visulate provides mechanisms to make it easier to navigate the volume of schema objects.

![52,000 Packages!](/images/ebs-unfiltered.png){: class="screenshot" tabindex="0" }

## Object Search

A search form provides direct access to individual schema objects. For example, a search for ap_bank_accounts_all will provide links to a table definition in the AP schema and a synonym in the APPS schema.

![Search for objects](/images/ebs-object-search.png){: class="screenshot" tabindex="0" }

## Product Prefix Navigation Filter

Oracle applies a naming convention to associate E-Business Suite database objects with the products that own them. Each product is assigned a 2 or 3 character product prefix. For example, all Accounts Receivable object names are prefixed with AR_. Visulate's object filter feature can be used to filter objects by product prefix.

 The Database Object Selection screen presents a list of product prefixes when an E-Business Suite database is selected in the Database drop down.

![Product Lookup](/images/ebs-product-lookup.png){: class="screenshot" tabindex="0" }

Selecting a value populates the Object Filter field and limits the list of schemas in the Schema drop down to list only schemas with objects that belong to the selected product.

![AR Objects](/images/ebs-ar-objects.png){: class="screenshot" tabindex="0" }

It also filters the list of objects when a schema is selected. With an object filter of "AR_*" the menu lists the 294 Receivables package bodies.

![AR Package Bodies](/images/ebs-filtered-package-bodies.png){: class="screenshot" tabindex="0" }