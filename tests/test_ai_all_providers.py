import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ai_provider_manager

def main():
    print("Testing all 5 AI providers:")
    for pid in ['gemini_1', 'gemini_2', 'openrouter', 'groq', 'mistral_ocr']:
        res = ai_provider_manager.test_provider_connection(pid)
        print(f"{pid}: success={res.get('success')} latency={res.get('latency_ms')}ms error={res.get('error')}")

if __name__ == '__main__':
    main()
