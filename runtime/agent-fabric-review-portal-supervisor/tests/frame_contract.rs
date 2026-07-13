use std::io::{BufReader, Cursor};

use agent_fabric_review_portal_supervisor::{FrameError, MAX_LF_FRAME_BYTES, read_lf_frame};

#[test]
fn relays_bounded_lf_frames_as_opaque_bytes_without_json_or_utf8_parsing() {
    let mut reader = BufReader::new(Cursor::new(b"\xffnot-json\nsecond\n"));

    assert_eq!(
        read_lf_frame(&mut reader).expect("first frame"),
        Some(b"\xffnot-json\n".to_vec()),
    );
    assert_eq!(
        read_lf_frame(&mut reader).expect("second frame"),
        Some(b"second\n".to_vec()),
    );
    assert_eq!(read_lf_frame(&mut reader).expect("clean EOF"), None);
}

#[test]
fn rejects_oversize_crlf_and_unterminated_frames() {
    let mut exact_limit = vec![b'x'; MAX_LF_FRAME_BYTES - 1];
    exact_limit.push(b'\n');
    assert_eq!(
        read_lf_frame(&mut BufReader::new(Cursor::new(exact_limit.clone())))
            .expect("exact ceiling frame"),
        Some(exact_limit),
    );

    let mut oversize = vec![b'x'; MAX_LF_FRAME_BYTES];
    oversize.push(b'\n');
    assert!(matches!(
        read_lf_frame(&mut BufReader::new(Cursor::new(oversize))),
        Err(FrameError::FrameTooLarge)
    ));
    assert!(matches!(
        read_lf_frame(&mut BufReader::new(Cursor::new(b"value\r\n"))),
        Err(FrameError::CarriageReturn)
    ));
    assert!(matches!(
        read_lf_frame(&mut BufReader::new(Cursor::new(b"unterminated"))),
        Err(FrameError::UnterminatedFrame)
    ));
}
