import sys
import os

from nlp_unified import extract_medical_entities

if __name__ == "__main__":
    text = "HAFTA ADET RÖTARI KABIZLIK DIŞINDA YAKINMASI YOK"
    res = extract_medical_entities(text)
    print("Drugs found:", res.drugs)
