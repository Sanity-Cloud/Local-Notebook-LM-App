import argparse, sys

from .processor_bootstrap import generate_audio


def main():
    parser = argparse.ArgumentParser(description="Generate a podcast from a PDF document")
    
    parser.add_argument("--pdf", type=str, required=False, default=None, help="Path to the PDF file")
    parser.add_argument("--output_dir", type=str, default="./output", help="Directory to save output files")
    parser.add_argument("--llm_model", type=str, default="gemini-3-flash-preview:cloud", help="LLM model name")
    parser.add_argument("--language", type=str, default="english", help="Language for generation")
    parser.add_argument("--format_type", type=str, choices=["podcast", "narration", "interview", "panel-discussion", "summary", "article", "lecture", "q-and-a", "tutorial", "debate", "meeting", "analysis"], default="podcast", help="Output format type")
    parser.add_argument("--style", type=str, choices=["normal", "formal", "casual", "enthusiastic", "serious", "humorous", "gen-z", "technical"], default="normal", help="Speaking style")
    parser.add_argument("--length", type=str, choices=["short", "medium", "long"], default="medium", help="Length of output")
    parser.add_argument("--num_speakers", type=int, default=None, help="Number of speakers for multi-speaker formats")
    parser.add_argument("--custom_preferences", type=str, default=None, help="Custom preferences for generation")
    parser.add_argument("--is-vlm", action="store_true", help="Enable multimodal prompting by including extracted PDF images")
    parser.add_argument("--transcript_file", type=str, default=None, help="Path to an existing transcript JSON file to use instead of generating from PDF")

    args = parser.parse_args()

    if not args.pdf and not args.transcript_file:
        parser.error("--pdf is required unless --transcript_file is provided")

    audio_path = generate_audio(
        pdf_path=args.pdf or "",
        output_dir=args.output_dir,
        llm_model=args.llm_model,
        language=args.language,
        format_type=args.format_type,
        style=args.style,
        length=args.length,
        num_speakers=args.num_speakers,
        custom_preferences=args.custom_preferences,
        is_vlm=args.is_vlm,
        transcript_file=args.transcript_file,
    )
    print(f"Audio generated: {audio_path}")


if __name__ == "__main__":
    sys.exit(main())