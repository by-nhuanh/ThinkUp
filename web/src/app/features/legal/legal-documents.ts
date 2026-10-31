export interface LegalContact {
  operator: string;
  address: string;
  hotline: string;
  email: string;
}

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  highlight?: string;
}

export interface LegalGroup {
  id: string;
  title: string;
  description?: string;
  sections: LegalSection[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  shortTitle: string;
  title: string;
  version: string;
  effectiveDate: string;
  intro: string[];
  groups: LegalGroup[];
}

export type LegalDocumentId = "terms" | "policy";

export const LEGAL_CONTACT: LegalContact = {
  operator: "ThinkUp",
  address: "669 Đỗ Mười, Khu phố 13, Linh Xuân, Hồ Chí Minh",
  hotline: "0234 000 864",
  email: "thinkup.edu.vn@gmail.com",
};

const sharedMeta = {
  version: "1.0",
  effectiveDate: "15/06/2026",
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    id: "terms",
    shortTitle: "Điều khoản sử dụng",
    title: "ĐIỀU KHOẢN SỬ DỤNG THINKUP",
    ...sharedMeta,
    intro: [
      "Điều khoản này quy định quyền và nghĩa vụ giữa ThinkUp với khách truy cập, học viên, giảng viên, giảng viên cộng tác, người đăng nội dung và các cá nhân, tổ chức sử dụng website, phòng học trực tuyến, Code Lab cùng những dịch vụ mang thương hiệu ThinkUp.",
      "Bằng việc tạo tài khoản, nhấn nút đồng ý, mua khóa học, đăng tải nội dung, đăng ký làm giảng viên hoặc tiếp tục sử dụng ThinkUp, người dùng xác nhận đã đọc, hiểu và đồng ý chịu sự ràng buộc của Điều khoản này cùng Chính sách nền tảng được dẫn chiếu.",
    ],
    groups: [
      {
        id: "terms-general",
        title: "I. QUY ĐỊNH CHUNG",
        sections: [
          {
            id: "terms-scope",
            title: "1. Phạm vi và chấp thuận điện tử",
            paragraphs: [
              "ThinkUp là nền tảng công nghệ kết nối giảng viên và học viên, cung cấp công cụ để đăng tải, giới thiệu, mua, học và trao đổi về khóa học trực tuyến.",
              "Việc nhấn “Đồng ý”, “Đăng ký”, “Thanh toán”, “Đăng ký trở thành giảng viên” hoặc tiếp tục sử dụng sau khi Điều khoản được cung cấp là hành vi chấp thuận bằng phương tiện điện tử. ThinkUp có thể lưu phiên bản, ngày giờ, tài khoản, giao dịch và thông tin kỹ thuật cần thiết để chứng minh việc chấp thuận và phòng chống gian lận.",
            ],
          },
          {
            id: "terms-age",
            title: "2. Độ tuổi và năng lực sử dụng",
            paragraphs: [
              "Người dùng phải từ đủ 15 tuổi trở lên để tạo tài khoản. Người dưới 18 tuổi muốn mua khóa học phải có sự đồng ý và giám sát của cha mẹ hoặc người giám hộ hợp pháp.",
              "Người dùng tự chịu trách nhiệm về năng lực hành vi dân sự và tính chính xác của thông tin cung cấp. ThinkUp có thể yêu cầu xác minh độ tuổi hoặc sự đồng ý của người đại diện khi có căn cứ hợp lý.",
            ],
          },
          {
            id: "terms-account",
            title: "3. Tài khoản, OTP và đăng nhập liên kết",
            paragraphs: [
              "Mỗi tài khoản đại diện cho một cá nhân. Người dùng phải bảo mật email, mật khẩu, OTP và phiên đăng nhập; không được cho thuê, mua bán, chuyển nhượng hoặc chia sẻ tài khoản.",
              "Khi đăng nhập qua Google hoặc nhà cung cấp OAuth khác, người dùng đồng ý cho ThinkUp tiếp nhận dữ liệu nằm trong phạm vi đã cho phép và đồng thời chịu điều khoản của nhà cung cấp tương ứng.",
            ],
            bullets: [
              "Không để người khác học, làm bài kiểm tra hoặc nhận chứng chỉ thay mình.",
              "Không tạo nhiều tài khoản để lạm dụng voucher, thao túng đánh giá hoặc né tránh chế tài.",
              "Thông báo ngay cho ThinkUp khi phát hiện tài khoản bị truy cập trái phép.",
              "ThinkUp có thể yêu cầu xác thực lại trước thao tác đổi mật khẩu, cập nhật thanh toán hoặc rút tiền.",
            ],
          },
          {
            id: "terms-license",
            title: "4. Quyền sử dụng nền tảng",
            paragraphs: [
              "ThinkUp cấp quyền sử dụng có giới hạn, cá nhân, không độc quyền, không được chuyển nhượng và có thể bị thu hồi. Mua khóa học là mua quyền truy cập nội dung, không phải nhận chuyển giao quyền sở hữu trí tuệ.",
              "Tài liệu chỉ được tải xuống khi khóa học cho phép và chỉ được sử dụng cho mục đích học tập cá nhân, phi thương mại, trừ khi chủ sở hữu có chấp thuận khác bằng văn bản.",
            ],
          },
          {
            id: "terms-prohibited",
            title: "5. Hành vi bị cấm",
            bullets: [
              "Sao chép, quay màn hình, thu âm, phát lại hoặc phân phối trái phép khóa học.",
              "Bán lại khóa học, tài khoản, tài liệu, lời giải, chứng chỉ hoặc quyền truy cập.",
              "Scraping, crawling, dùng bot hoặc thu thập dữ liệu tự động khi chưa được phép.",
              "Dịch ngược, vượt qua xác thực, phá cơ chế bảo mật hoặc khai thác lỗ hổng.",
              "Phát tán mã độc, phishing, spam, DDoS hoặc làm cạn kiệt tài nguyên.",
              "Dùng Code Lab để đào tiền ảo, quét mạng, tấn công hệ thống hoặc thực hiện hành vi trái pháp luật.",
              "Dùng công cụ tự động chạy video, tạo tiến độ giả hoặc gian lận chứng chỉ.",
              "Kêu gọi giao dịch ngoài nền tảng nhằm né phí hoặc cơ chế bảo vệ của ThinkUp.",
              "Quấy rối, đe dọa, xúc phạm, phân biệt đối xử hoặc xâm phạm quyền của người khác.",
            ],
          },
        ],
      },
      {
        id: "terms-learning-commerce",
        title: "II. KHÓA HỌC, THANH TOÁN VÀ CHỨNG CHỈ",
        sections: [
          {
            id: "terms-role",
            title: "6. Vai trò của ThinkUp và giảng viên",
            paragraphs: [
              "ThinkUp chủ yếu là nền tảng công nghệ kết nối. Giảng viên chịu trách nhiệm về tính chính xác, hợp pháp, chất lượng chuyên môn và quyền sử dụng tài liệu trong khóa học. ThinkUp thực hiện kiểm duyệt cơ bản nhưng không thể bảo đảm mọi nội dung tuyệt đối không có sai sót.",
              "Trừ khi được công bố rõ, khóa học không bảo đảm việc làm, mức thu nhập, kết quả thi, sự công nhận của tổ chức bên ngoài và không cấp văn bằng thuộc hệ thống giáo dục quốc dân.",
            ],
          },
          {
            id: "terms-payment",
            title: "7. Giá, voucher, thanh toán và chứng từ",
            paragraphs: [
              "Trước khi thanh toán, ThinkUp hiển thị khóa học, giá, giảm giá, voucher, thuế hoặc phí nếu có, tổng tiền và phương thức thanh toán. Mỗi đơn hàng được áp dụng tối đa một voucher; voucher không được quy đổi thành tiền mặt.",
              "ThinkUp chỉ công nhận giao dịch qua cổng thanh toán chính thức được tích hợp. Quyền truy cập được cấp sau khi giao dịch được xác nhận và biên lai điện tử được lưu trong Lịch sử mua hàng.",
              "Giao dịch chuyển tiền cá nhân ngoài hệ thống không được ThinkUp công nhận hoặc bảo vệ.",
            ],
          },
          {
            id: "terms-refund",
            title: "8. Chính sách không hoàn tiền",
            highlight: "Do nội dung số được cấp quyền truy cập ngay sau khi thanh toán thành công, ThinkUp áp dụng chính sách không hoàn tiền.",
            paragraphs: [
              "Ngoại lệ duy nhất được xem xét là khóa học bị ThinkUp buộc phải gỡ bỏ hoàn toàn do lỗi nghiêm trọng từ phía giảng viên, khiến học viên không thể tiếp tục truy cập, hoặc trường hợp pháp luật bắt buộc có quy định khác.",
              "Không hoàn tiền vì đổi ý, không sắp xếp được thời gian, không đạt kỳ vọng, không tương thích với thiết bị cá nhân đã nằm ngoài cấu hình được công bố, không đọc kỹ mô tả hoặc tài khoản bị khóa hợp lệ.",
              "Khoản tiền bị trừ trùng, sai số tiền, giao dịch thành công nhưng chưa cấp quyền hoặc sai lệch kỹ thuật được xử lý như yêu cầu điều chỉnh giao dịch, không tạo thành chính sách hoàn tiền tự nguyện mới.",
            ],
          },
          {
            id: "terms-lifetime",
            title: "9. Quyền truy cập trọn đời",
            paragraphs: [
              "“Truy cập trọn đời” là quyền truy cập không giới hạn thời gian khi tài khoản còn hợp lệ, ThinkUp và khóa học còn hoạt động, đồng thời ThinkUp còn quyền hợp pháp để cung cấp nội dung.",
              "Nếu giảng viên ngừng bán, học viên đã mua vẫn tiếp tục truy cập. Nội dung cập nhật được bổ sung vào cùng khóa học được cung cấp không thu thêm phí, trừ khi được công bố rõ là sản phẩm độc lập.",
            ],
          },
          {
            id: "terms-certificate",
            title: "10. Tiến độ, bài kiểm tra và chứng chỉ",
            paragraphs: [
              "Điều kiện hoàn thành có thể gồm xem đủ video bắt buộc, đạt điểm Quiz tối thiểu, hoàn thành Code Lab và tuân thủ trung thực học thuật.",
              "Chứng chỉ ThinkUp chỉ xác nhận việc hoàn thành khóa học trên nền tảng; không phải văn bằng quốc gia, giấy phép hành nghề hoặc cam kết được tổ chức bên ngoài công nhận.",
              "ThinkUp có thể hủy kết quả, thu hồi chứng chỉ hoặc khóa tài khoản khi phát hiện chia sẻ tài khoản, nhờ người khác làm bài, dùng công cụ tự động, giả mạo hoặc can thiệp dữ liệu.",
            ],
          },
        ],
      },
      {
        id: "terms-community",
        title: "III. NỘI DUNG VÀ CỘNG ĐỒNG",
        sections: [
          {
            id: "terms-user-content",
            title: "11. Nội dung người dùng",
            paragraphs: [
              "Người dùng giữ quyền sở hữu nội dung mình tạo và cấp cho ThinkUp giấy phép không độc quyền, miễn phí bản quyền trong phạm vi cần thiết để lưu trữ, sao lưu, chuyển đổi định dạng, hiển thị, truyền tải, kiểm duyệt và thực hiện nghĩa vụ pháp lý.",
              "Người dùng bảo đảm nội dung thuộc quyền sử dụng hợp pháp, không xâm phạm bản quyền, quyền riêng tư, bí mật kinh doanh hoặc pháp luật. ThinkUp không bán tác phẩm cá nhân của người dùng như một sản phẩm độc lập.",
            ],
          },
          {
            id: "terms-community-content",
            title: "12. Đánh giá, Q&A, blog và tin nhắn",
            paragraphs: [
              "Đánh giá phải phản ánh trải nghiệm thực tế. Không được mua bán đánh giá, thao túng xếp hạng, đe dọa để nhận ưu đãi, công bố dữ liệu cá nhân hoặc dùng đánh giá để quảng cáo.",
              "Tin nhắn, blog và Q&A phải phù hợp hoạt động học tập. ThinkUp có thể tiếp cận khi cần xử lý báo cáo, bảo mật, tranh chấp hoặc nghĩa vụ pháp lý; có thể gỡ nội dung vi phạm nhưng không chỉnh sửa ý nghĩa đánh giá để tạo ấn tượng sai lệch.",
            ],
          },
          {
            id: "terms-study-room",
            title: "13. Phòng học trực tuyến",
            paragraphs: [
              "Phòng học có thể hỗ trợ chat, thoại, webcam, chia sẻ màn hình, bảng cộng tác và tải tệp. Khi bật micro, camera hoặc chia sẻ màn hình, nội dung tương ứng có thể được thành viên trong phòng nghe hoặc nhìn thấy.",
            ],
            bullets: [
              "Kiểm tra màn hình trước khi chia sẻ và không để lộ mật khẩu hoặc dữ liệu nhạy cảm.",
              "Chỉ chia sẻ tệp, hình ảnh và âm thanh mà mình có quyền sử dụng.",
              "Không tự ý ghi âm, ghi hình hoặc phát tán buổi học khi chưa được đồng ý.",
              "Tôn trọng quyền riêng tư và quyết định hợp lệ của chủ phòng, người điều phối.",
            ],
          },
          {
            id: "terms-moderation",
            title: "14. Kiểm duyệt và xử lý vi phạm",
            paragraphs: [
              "Tùy mức độ và lịch sử vi phạm, ThinkUp có thể cảnh cáo, gỡ nội dung, hạn chế tính năng, dừng Code Lab, thu hồi chứng chỉ, tạm khóa hoặc chấm dứt tài khoản, gỡ khóa học và tạm giữ khoản tiền liên quan trực tiếp đến tranh chấp.",
              "ThinkUp có thể xử lý ngay khi hành vi gây nguy hiểm, tấn công hệ thống, gian lận thanh toán, xâm phạm bản quyền nghiêm trọng hoặc liên quan nội dung bất hợp pháp. Khi có thể, ThinkUp sẽ thông báo lý do và cung cấp cách yêu cầu xem xét lại.",
            ],
          },
        ],
      },
      {
        id: "terms-instructor",
        title: "IV. ĐIỀU KHOẢN DÀNH CHO GIẢNG VIÊN",
        sections: [
          {
            id: "terms-instructor-relation",
            title: "15. Quan hệ hợp tác và nội dung khóa học",
            paragraphs: [
              "Giảng viên là đối tác cung cấp nội dung độc lập, không phải nhân viên, đại lý hoặc đại diện pháp lý của ThinkUp. ThinkUp có thể yêu cầu hồ sơ chuyên môn, giấy tờ định danh, mã số thuế, tài khoản ngân hàng chính chủ và tài liệu chứng minh quyền đối với nội dung.",
              "Giảng viên giữ quyền sở hữu và cấp cho ThinkUp giấy phép không độc quyền để lưu trữ, truyền phát, chuyển đổi kỹ thuật, tạo bản xem trước, quảng bá và tiếp tục cung cấp cho học viên đã mua.",
              "Khóa học đã có học viên không được xóa vĩnh viễn chỉ theo yêu cầu đơn phương. ThinkUp có thể tiếp tục cung cấp cho học viên hiện hữu hoặc gỡ ngay nếu nội dung vi phạm pháp luật, bản quyền hay gây nguy hiểm.",
            ],
          },
          {
            id: "terms-instructor-quality",
            title: "16. Tiêu chuẩn và hỗ trợ",
            paragraphs: [
              "Khóa học cần có mục tiêu và cấu trúc rõ ràng, ít nhất 30 phút nội dung, 5 bài học, video tối thiểu 720p nếu có, âm thanh rõ và bài tập hoặc kiểm tra phù hợp, trừ trường hợp được ThinkUp chấp thuận khác.",
              "Giảng viên có trách nhiệm hỗ trợ Q&A trong thời gian hợp lý, khuyến nghị dưới 48 giờ. Khóa học hỗ trợ kém có thể bị hạ thứ hạng hoặc tạm ngừng bán.",
            ],
          },
          {
            id: "terms-instructor-revenue",
            title: "17. Doanh thu và đối soát",
            highlight: "Giảng viên nhận 40% doanh thu thuần từ marketing của ThinkUp hoặc 45% doanh thu thuần từ liên kết giới thiệu trực tiếp của giảng viên.",
            paragraphs: [
              "Doanh thu thuần là tiền ThinkUp thực nhận sau khi trừ phí cổng thanh toán, thuế, giảm giá, khoản điều chỉnh giao dịch và chargeback hợp lệ. Phần dành cho giảng viên là tổng quỹ của chủ khóa học và các giảng viên cộng tác.",
              "Doanh thu được giữ đối soát 30 ngày, sau đó chuyển thành số dư khả dụng. Giảng viên gửi yêu cầu rút từ ngày 01–05 hằng tháng khi đạt mức tối thiểu do ThinkUp công bố từng thời kỳ, ví dụ 500.000 đồng. Yêu cầu hợp lệ được chuyển khoản trong 5 ngày làm việc tiếp theo.",
              "Chargeback hợp lệ phát sinh sau khi đã chi trả có thể được khấu trừ vào số dư hoặc doanh thu tương lai. Thay đổi tỷ lệ cộng tác chỉ áp dụng cho giao dịch phát sinh sau khi hệ thống ghi nhận.",
            ],
          },
        ],
      },
      {
        id: "terms-final",
        title: "V. BẢO MẬT, TRÁCH NHIỆM VÀ GIẢI QUYẾT TRANH CHẤP",
        sections: [
          {
            id: "terms-ip",
            title: "18. Bản quyền và sở hữu trí tuệ",
            paragraphs: [
              `Giao diện, logo, thương hiệu, mã nguồn, cơ sở dữ liệu và tài liệu vận hành thuộc quyền sở hữu hoặc quyền sử dụng hợp pháp của ThinkUp. Thông báo vi phạm gửi tới ${LEGAL_CONTACT.email}, kèm thông tin người yêu cầu, tác phẩm, đường dẫn nội dung, căn cứ chứng minh quyền và tuyên bố trung thực.`,
            ],
          },
          {
            id: "terms-privacy",
            title: "19. Dữ liệu cá nhân và dịch vụ bên thứ ba",
            paragraphs: [
              "Việc xử lý dữ liệu được quy định chi tiết tại Chính sách nền tảng ThinkUp. Chấp thuận Điều khoản không thay thế sự đồng ý riêng đối với hoạt động xử lý dữ liệu tùy chọn.",
              "ThinkUp có thể tích hợp nhà cung cấp đăng nhập, cổng thanh toán, email, lưu trữ và truyền thông thời gian thực. Các dịch vụ này có điều khoản riêng; ThinkUp không lưu số thẻ đầy đủ, mã CVV hoặc mật khẩu ngân hàng trên máy chủ nội bộ.",
            ],
          },
          {
            id: "terms-service",
            title: "20. Bảo trì, bất khả kháng và giới hạn trách nhiệm",
            paragraphs: [
              "ThinkUp nỗ lực duy trì nền tảng ổn định 24/7. Bảo trì định kỳ được thông báo trước ít nhất 24 giờ; cập nhật bảo mật khẩn cấp có thể được thực hiện ngay.",
              "Trong phạm vi pháp luật cho phép, ThinkUp không chịu trách nhiệm cho gián đoạn do thiên tai, chiến tranh, dịch bệnh, mất điện, đứt cáp, sự cố hạ tầng diện rộng hoặc tấn công mạng ngoài khả năng kiểm soát hợp lý.",
              "Điều khoản không loại trừ trách nhiệm do hành vi cố ý hoặc lỗi nghiêm trọng của ThinkUp, trách nhiệm dữ liệu cá nhân, quyền lợi người tiêu dùng và nghĩa vụ không được phép loại trừ theo pháp luật Việt Nam.",
            ],
          },
          {
            id: "terms-changes",
            title: "21. Thay đổi và chấm dứt",
            paragraphs: [
              "ThinkUp có thể cập nhật Điều khoản do thay đổi pháp luật, tính năng, mô hình vận hành hoặc yêu cầu bảo mật. Thay đổi đáng kể sẽ được thông báo qua email hoặc trong nền tảng trong thời gian hợp lý trước khi áp dụng, trừ trường hợp cần xử lý sớm theo pháp luật hoặc bảo mật.",
              "Người dùng có thể ngừng sử dụng hoặc yêu cầu đóng tài khoản. ThinkUp sẽ thông báo hậu quả chính, gồm khả năng mất quyền truy cập, tiến độ và chứng chỉ; dữ liệu vẫn có thể được lưu trong thời hạn pháp luật yêu cầu.",
            ],
          },
          {
            id: "terms-dispute",
            title: "22. Khiếu nại, luật áp dụng và điều khoản chung",
            paragraphs: [
              `Người dùng có thể liên hệ qua email ${LEGAL_CONTACT.email}, hotline ${LEGAL_CONTACT.hotline}, Trung tâm trợ giúp hoặc địa chỉ ${LEGAL_CONTACT.address}. Các bên ưu tiên thương lượng và hòa giải trước khi yêu cầu cơ quan hoặc Tòa án có thẩm quyền tại Việt Nam giải quyết.`,
              "Điều khoản được điều chỉnh bởi pháp luật Việt Nam. Nếu một phần không hợp lệ hoặc không thể thi hành, phần còn lại vẫn giữ hiệu lực. Bản tiếng Việt là bản ưu tiên áp dụng nếu có khác biệt với bản dịch.",
            ],
          },
        ],
      },
    ],
  },

  policy: {
    id: "policy",
    shortTitle: "Chính sách nền tảng",
    title: "CHÍNH SÁCH NỀN TẢNG THINKUP",
    ...sharedMeta,
    intro: [
      "Chính sách này áp dụng cho khách truy cập, học viên, giảng viên, giảng viên cộng tác, quản trị viên và các cá nhân, tổ chức sử dụng nền tảng ThinkUp.",
      "Chính sách quy định cách ThinkUp vận hành marketplace học tập, bảo vệ học viên, hợp tác với giảng viên, kiểm duyệt cộng đồng và xử lý dữ liệu cá nhân.",
    ],
    groups: [
      {
        id: "policy-general",
        title: "TRỤ CỘT I: CHÍNH SÁCH CHUNG CỦA NỀN TẢNG",
        description: "Các quy định nền tảng áp dụng ngay khi người dùng truy cập, duyệt web hoặc sử dụng bất kỳ dịch vụ nào của ThinkUp.",
        sections: [
          {
            id: "policy-purpose",
            title: "1.1. Mục đích và phạm vi cung cấp dịch vụ",
            paragraphs: [
              "ThinkUp hoạt động như một nền tảng công nghệ kết nối, cung cấp không gian để giảng viên và học viên tương tác, giao dịch và học tập.",
              "ThinkUp cung cấp công cụ và môi trường học tập nhưng không cam kết việc làm, mức lương, kết quả thi hoặc sự công nhận chứng chỉ bởi tổ chức bên ngoài. Nội dung học thuật, quan điểm và phương pháp giảng dạy thuộc trách nhiệm chính của giảng viên cung cấp.",
            ],
          },
          {
            id: "policy-age",
            title: "1.2. Điều kiện và độ tuổi sử dụng",
            paragraphs: [
              "Người dùng phải từ đủ 15 tuổi. Người dưới 18 tuổi muốn mua khóa học phải có sự đồng ý và giám sát của cha mẹ hoặc người giám hộ hợp pháp.",
              "Người dùng tự chịu trách nhiệm về năng lực hành vi dân sự khi thực hiện giao dịch, bình luận hoặc cam kết trên nền tảng.",
            ],
          },
          {
            id: "policy-community",
            title: "1.3. Tiêu chuẩn cộng đồng",
            bullets: [
              "Không xúc phạm, lăng mạ, đe dọa, phân biệt đối xử hoặc kích động thù địch.",
              "Không spam, đăng liên kết lừa đảo, mã độc hoặc quảng bá trái phép nền tảng cạnh tranh.",
              "Không chia sẻ thông tin liên hệ hay tài khoản ngân hàng nhằm chèo kéo giao dịch ngoài ThinkUp.",
              "Không giả mạo, xâm phạm đời tư, bản quyền, quyền hình ảnh hoặc dữ liệu cá nhân.",
            ],
          },
          {
            id: "policy-ip",
            title: "1.4. Sở hữu trí tuệ",
            paragraphs: [
              "Thiết kế UI/UX, logo, mã nguồn, thuật toán, cơ sở dữ liệu và tài liệu hướng dẫn thuộc quyền sở hữu hoặc quyền sử dụng hợp pháp của ThinkUp. Người dùng không được sao chép, chỉnh sửa, dịch ngược hoặc sử dụng thương mại khi chưa được chấp thuận.",
              "Video, bài tập và tài liệu do giảng viên tạo vẫn thuộc quyền sở hữu của giảng viên hoặc chủ thể cấp phép hợp pháp.",
            ],
          },
          {
            id: "policy-user-content",
            title: "1.5. Nội dung người dùng",
            paragraphs: [
              "Người dùng giữ quyền sở hữu nội dung mình tạo và cấp cho ThinkUp giấy phép không độc quyền, miễn phí bản quyền trong phạm vi cần thiết để lưu trữ, sao lưu, chuyển đổi định dạng, hiển thị, truyền tải, kiểm duyệt và thực hiện nghĩa vụ pháp lý.",
              "Giấy phép chấm dứt khi nội dung bị xóa, trừ bản sao lưu kỹ thuật, bằng chứng vi phạm, nghĩa vụ pháp lý hoặc nội dung đã được sử dụng hợp lệ trước thời điểm xóa.",
            ],
          },
          {
            id: "policy-enforcement",
            title: "1.6. Xử lý vi phạm",
            bullets: [
              "Mức 1 – Cảnh cáo: ẩn hoặc xóa nội dung và gửi thông báo cảnh cáo.",
              "Mức 2 – Hạn chế: tạm khóa bình luận, Q&A, phòng học hoặc Code Lab trong thời gian phù hợp, ví dụ 7 hoặc 30 ngày.",
              "Mức 3 – Khóa vĩnh viễn: áp dụng với gian lận thanh toán, phá hoại hệ thống, chia sẻ tài khoản hoặc vi phạm bản quyền nghiêm trọng; không hoàn tiền, trừ khi pháp luật bắt buộc khác.",
            ],
            paragraphs: [
              "ThinkUp có thể xử lý ngay khi hành vi có nguy cơ gây thiệt hại. Người dùng có thể gửi giải trình hoặc yêu cầu xem xét lại qua kênh hỗ trợ chính thức.",
            ],
          },
          {
            id: "policy-service-availability",
            title: "1.7. Bảo trì và cam kết dịch vụ",
            paragraphs: [
              "ThinkUp nỗ lực duy trì hoạt động ổn định 24/7. Lịch bảo trì định kỳ được thông báo trước ít nhất 24 giờ qua Trung tâm thông báo.",
              "ThinkUp được miễn trách nhiệm trong phạm vi pháp luật cho phép khi gián đoạn do thiên tai, đứt cáp, sự cố nhà cung cấp đám mây hoặc tấn công mạng diện rộng ngoài khả năng kiểm soát hợp lý.",
            ],
          },
        ],
      },
      {
        id: "policy-learner",
        title: "TRỤ CỘT II: CHÍNH SÁCH DÀNH CHO HỌC VIÊN",
        description: "Quyền lợi, nghĩa vụ và giới hạn khi đăng ký, học tập và giao dịch trên ThinkUp.",
        sections: [
          {
            id: "policy-learner-account",
            title: "2.1. Đăng ký và quản lý tài khoản",
            paragraphs: [
              "Mỗi tài khoản đại diện cho một cá nhân. Học viên phải bảo mật email, mật khẩu, OTP và không được cho mượn, cho thuê hoặc chia sẻ tài khoản.",
              "ThinkUp có thể phân tích địa chỉ IP, thiết bị và phiên đăng nhập để phát hiện truy cập đồng thời bất thường; có thể tạm khóa để điều tra hoặc thu hồi quyền truy cập khi xác định vi phạm nghiêm trọng.",
            ],
          },
          {
            id: "policy-payment",
            title: "2.2. Thanh toán và biên lai",
            paragraphs: [
              "ThinkUp chỉ ghi nhận giao dịch qua cổng thanh toán chính thức được tích hợp. Sau khi thanh toán thành công, biên lai điện tử được cập nhật trong Lịch sử mua hàng và có thể tải dưới dạng PDF.",
              "ThinkUp không công nhận hoặc bảo vệ việc chuyển tiền cá nhân ngoài hệ thống.",
            ],
          },
          {
            id: "policy-voucher",
            title: "2.3. Mã giảm giá",
            paragraphs: [
              "Mỗi đơn hàng được áp dụng tối đa một mã giảm giá. Mã không được quy đổi thành tiền mặt và có thể có thời hạn, số lượt sử dụng hoặc giá trị đơn hàng tối thiểu.",
              "Nghiêm cấm tạo nhiều tài khoản để lạm dụng ưu đãi. ThinkUp có thể hủy mã được tạo hoặc sử dụng do lỗi kỹ thuật hay gian lận.",
            ],
          },
          {
            id: "policy-refund",
            title: "2.4. Chính sách không hoàn tiền",
            highlight: "ThinkUp không hoàn tiền sau khi giao dịch mua khóa học đã thành công và quyền truy cập nội dung số được cấp.",
            paragraphs: [
              "Ngoại lệ duy nhất được xem xét là khóa học bị ThinkUp buộc phải gỡ bỏ hoàn toàn do lỗi nghiêm trọng từ phía giảng viên, khiến học viên không thể tiếp tục truy cập, hoặc trường hợp pháp luật bắt buộc có quy định khác.",
              "Không hoàn tiền vì đổi ý, không sắp xếp được thời gian, không đạt kỳ vọng, thiết bị cá nhân không đáp ứng yêu cầu đã công bố, không đọc kỹ mô tả hoặc tài khoản bị khóa hợp lệ.",
              "Giao dịch bị tính trùng, sai số tiền hoặc chưa cấp quyền do lỗi kỹ thuật được đối soát như điều chỉnh giao dịch, không phải ngoại lệ hoàn tiền tự nguyện.",
            ],
          },
          {
            id: "policy-lifetime",
            title: "2.5. Quyền truy cập khóa học",
            paragraphs: [
              "Truy cập trọn đời là quyền truy cập không giới hạn thời gian khi tài khoản hợp lệ, khóa học và ThinkUp còn hoạt động, đồng thời ThinkUp còn quyền hợp pháp cung cấp nội dung.",
              "Học viên được hưởng miễn phí các cập nhật thuộc cùng khóa học. Khi giảng viên ngừng bán, học viên đã mua vẫn được duy trì quyền truy cập nếu không có trở ngại pháp lý.",
            ],
          },
          {
            id: "policy-certificate",
            title: "2.6. Chứng chỉ và liêm chính học tập",
            paragraphs: [
              "Chứng chỉ được cấp khi học viên hoàn thành các video, Quiz và Code Lab bắt buộc theo điều kiện khóa học. Chứng chỉ có mã xác thực và QR duy nhất.",
              "Chứng chỉ không phải văn bằng giáo dục quốc dân và không bảo đảm được bên ngoài công nhận. Dùng công cụ tự động chạy video, nhờ người làm bài hoặc giả mạo chứng chỉ có thể dẫn đến thu hồi chứng chỉ và khóa tài khoản.",
            ],
          },
          {
            id: "policy-code-lab",
            title: "2.7. Không gian thực hành Code Lab",
            bullets: [
              "Chỉ sử dụng để viết, biên dịch, chạy thử mã và hoàn thành bài tập.",
              "Không thực thi malware, DDoS, quét lỗ hổng, đào tiền ảo hoặc truy cập dữ liệu trái phép.",
              "Không cố ý tạo vòng lặp vô hạn hoặc làm cạn RAM, CPU.",
              "ThinkUp có thể tự động dừng tiến trình, xóa môi trường tạm thời, hạn chế Code Lab hoặc khóa tài khoản.",
            ],
          },
          {
            id: "policy-interactions",
            title: "2.8. Đánh giá, Q&A, blog, tin nhắn và phòng học",
            paragraphs: [
              "Đánh giá phải phản ánh trải nghiệm thật; không được mua bán đánh giá hoặc thao túng xếp hạng. Nội dung Q&A, blog, bình luận và tin nhắn phải tuân thủ Tiêu chuẩn cộng đồng.",
              "Khi bật webcam, micro hoặc chia sẻ màn hình, người dùng hiểu nội dung được truyền đến thành viên trong phòng. Nghiêm cấm ghi âm, ghi hình người khác khi chưa có sự đồng ý, chia sẻ dữ liệu nhạy cảm hoặc cố tình làm gián đoạn phòng học.",
            ],
          },
        ],
      },
      {
        id: "policy-instructor",
        title: "TRỤ CỘT III: CHÍNH SÁCH DÀNH CHO GIẢNG VIÊN",
        description: "Thỏa thuận bắt buộc đối với chủ sở hữu khóa học và giảng viên cộng tác.",
        sections: [
          {
            id: "policy-instructor-verification",
            title: "3.1. Quan hệ hợp tác và xét duyệt",
            paragraphs: [
              "Giảng viên là đối tác cung cấp nội dung độc lập; không hình thành quan hệ lao động, nhân viên, đại lý hoặc đại diện ủy quyền với ThinkUp.",
              "Để nhận doanh thu, giảng viên phải cung cấp trung thực CCCD hoặc CMND, mã số thuế, tài khoản ngân hàng chính chủ và hồ sơ được yêu cầu. ThinkUp có quyền phê duyệt hoặc từ chối khóa học theo tiêu chuẩn nền tảng.",
            ],
          },
          {
            id: "policy-instructor-quality",
            title: "3.2. Tiêu chuẩn chất lượng",
            bullets: [
              "Video tối thiểu 720p, âm thanh rõ ràng và không có tạp âm gây khó chịu.",
              "Có mô tả, lộ trình rõ, tổng thời lượng tối thiểu 30 phút và ít nhất 5 bài giảng.",
              "Có Code Lab hoặc Quiz phù hợp.",
              "Không chứa nội dung 18+, thù địch, đa cấp, mã độc hoặc hướng dẫn phá hoại hệ thống.",
            ],
          },
          {
            id: "policy-instructor-ip",
            title: "3.3. Bản quyền và giấy phép",
            paragraphs: [
              "Giảng viên giữ 100% quyền sở hữu đối với nội dung mình tạo. Khi tải khóa học lên, giảng viên cấp cho ThinkUp quyền không độc quyền, có thể chuyển nhượng trong phạm vi vận hành để lưu trữ, sao chép, phân phối, hiển thị và dùng một phần nội dung cho quảng bá.",
              "Giảng viên cam kết có đủ quyền đối với video, hình ảnh, âm nhạc, phần mềm, mã nguồn và tài liệu. Nội dung vi phạm có thể bị gỡ ngay và giảng viên chịu trách nhiệm đối với tranh chấp do mình gây ra.",
            ],
          },
          {
            id: "policy-course-lifecycle",
            title: "3.4. Cập nhật và ngừng bán khóa học",
            paragraphs: [
              "Nội dung khóa học đang công khai phải được cập nhật qua phiên bản chờ quản trị viên duyệt để không làm gián đoạn học viên.",
              "Khóa học đã phát sinh giao dịch không được xóa vĩnh viễn theo yêu cầu đơn phương. Giảng viên chỉ được ngừng bán; học viên cũ vẫn tiếp tục truy cập, trừ khi nội dung phải gỡ do pháp luật, bản quyền hoặc yêu cầu của cơ quan có thẩm quyền.",
            ],
          },
          {
            id: "policy-collaborators",
            title: "3.5. Giảng viên cộng tác",
            paragraphs: [
              "Chủ sở hữu có quyền định giá, gửi yêu cầu xuất bản hoặc ngừng bán, mời hoặc gỡ cộng tác viên, phân quyền và thiết lập tỷ lệ chia nội bộ.",
              "Thay đổi tỷ lệ chỉ áp dụng cho đơn hàng phát sinh sau khi hệ thống ghi nhận. Nội dung đã đóng góp trước khi cộng tác viên bị gỡ vẫn thuộc quyền sử dụng vĩnh viễn của khóa học. ThinkUp không giải quyết các thỏa thuận tài chính ngoài hệ thống.",
            ],
          },
          {
            id: "policy-revenue",
            title: "3.6. Doanh thu và đối soát",
            highlight: "Giảng viên nhận 40% doanh thu thuần từ marketing của ThinkUp hoặc 45% doanh thu thuần từ liên kết giới thiệu trực tiếp.",
            paragraphs: [
              "Doanh thu thuần là tiền ThinkUp thực nhận sau phí cổng thanh toán, thuế, giảm giá, khoản điều chỉnh giao dịch và chargeback hợp lệ. Phần giảng viên là tổng quỹ của chủ khóa học và các cộng tác viên.",
              "Mỗi giao dịch được giữ đối soát 30 ngày. Giảng viên gửi yêu cầu rút từ ngày 01–05 khi số dư đạt mức tối thiểu do ThinkUp công bố từng thời kỳ, ví dụ 500.000 đồng; yêu cầu hợp lệ được chuyển khoản trong 5 ngày làm việc tiếp theo.",
              "Chargeback hợp lệ phát sinh sau chi trả được trừ vào số dư hoặc doanh thu tương lai. ThinkUp có thể tạm giữ khoản đang tranh chấp hoặc khi hồ sơ thanh toán chưa hợp lệ.",
            ],
          },
          {
            id: "policy-instructor-support",
            title: "3.7. Hỗ trợ học viên",
            paragraphs: [
              "Giảng viên có trách nhiệm trả lời Q&A trong thời gian hợp lý, khuyến nghị dưới 48 giờ. ThinkUp có thể đo tỷ lệ và thời gian phản hồi; khóa học hỗ trợ kém có thể bị hạ thứ hạng hoặc tạm ngừng bán.",
            ],
          },
        ],
      },
      {
        id: "policy-privacy",
        title: "TRỤ CỘT IV: CHÍNH SÁCH BẢO MẬT VÀ DỮ LIỆU",
        description: "Cam kết thu thập, lưu trữ, xử lý và bảo vệ dữ liệu của người dùng ThinkUp.",
        sections: [
          {
            id: "policy-data-collected",
            title: "4.1. Dữ liệu được thu thập",
            bullets: [
              "Dữ liệu định danh: họ tên, email, số điện thoại, avatar và thông tin OAuth.",
              "Dữ liệu giảng viên: giấy tờ định danh, mã số thuế, tài khoản ngân hàng và hồ sơ chuyên môn.",
              "Dữ liệu học tập: khóa học, tiến độ, thời lượng video, Quiz, Code Lab, ghi chú và chứng chỉ.",
              "Dữ liệu cộng đồng: đánh giá, Q&A, blog, tin nhắn, báo cáo và hoạt động phòng học.",
              "Dữ liệu kỹ thuật: IP, thiết bị, trình duyệt, hệ điều hành, cookie và nhật ký đăng nhập.",
            ],
          },
          {
            id: "policy-data-purpose",
            title: "4.2. Mục đích và căn cứ xử lý",
            paragraphs: [
              "Dữ liệu được dùng để tạo tài khoản, cấp quyền học, ghi nhận tiến độ, xử lý giao dịch, cấp chứng chỉ, đối soát doanh thu, vận hành cộng đồng, hỗ trợ, cá nhân hóa, bảo mật và thực hiện nghĩa vụ pháp lý.",
              "Tùy hoạt động, ThinkUp xử lý dữ liệu dựa trên sự đồng ý, việc thực hiện giao dịch, nghĩa vụ pháp lý hoặc quyền và lợi ích hợp pháp. Khi pháp luật yêu cầu đồng ý riêng, ThinkUp sẽ cung cấp thông tin cần thiết trước khi xin đồng ý.",
            ],
          },
          {
            id: "policy-cookies",
            title: "4.3. Cookie và phiên đăng nhập",
            paragraphs: [
              "ThinkUp sử dụng cookie hoặc cơ chế tương tự để duy trì đăng nhập, ghi nhớ lựa chọn, bảo vệ tài khoản, đo hiệu suất và gợi ý nội dung. Chặn cookie thiết yếu có thể khiến một số tính năng không hoạt động.",
            ],
          },
          {
            id: "policy-payment-data",
            title: "4.4. Bảo mật thanh toán",
            paragraphs: [
              "ThinkUp không lưu số thẻ đầy đủ, mã CVV hoặc mật khẩu Internet Banking trên máy chủ nội bộ. Dữ liệu nhạy cảm được xử lý bởi cổng thanh toán; ThinkUp chỉ nhận mã giao dịch, số tiền, trạng thái, thời gian và thông tin phương thức đã che bớt.",
            ],
          },
          {
            id: "policy-data-sharing",
            title: "4.5. Giới hạn chia sẻ dữ liệu",
            paragraphs: [
              "ThinkUp không bán, cho thuê hoặc trao đổi dữ liệu cá nhân vì mục đích quảng cáo thương mại ngoài nền tảng.",
              "Nhà cung cấp lưu trữ, email, OAuth và thanh toán chỉ tiếp nhận dữ liệu cần thiết để vận hành. Dữ liệu chỉ được cung cấp cho cơ quan nhà nước khi có yêu cầu hợp pháp hoặc căn cứ pháp luật phù hợp.",
              "Giảng viên chỉ được xem tên hiển thị, avatar, tiến độ và tương tác liên quan đến khóa học; không được truy cập email, số điện thoại hoặc địa chỉ của học viên qua công cụ quản trị.",
            ],
          },
          {
            id: "policy-live-data",
            title: "4.6. Webcam, micro và chia sẻ màn hình",
            paragraphs: [
              "Khi bật webcam, micro hoặc chia sẻ màn hình, dữ liệu được truyền đến thành viên trong phòng. Người dùng phải kiểm tra môi trường và đóng thông tin nhạy cảm trước khi chia sẻ.",
              "Không được ghi âm, ghi hình hoặc phát lại phiên học khi chưa thông báo và có sự đồng ý hợp lệ, trừ trường hợp pháp luật cho phép. Nếu tính năng chính thức thực hiện ghi, giao diện phải hiển thị rõ trạng thái.",
            ],
          },
          {
            id: "policy-retention-rights",
            title: "4.7. Lưu giữ và quyền của người dùng",
            paragraphs: [
              "ThinkUp lưu dữ liệu trong thời gian cần thiết để cung cấp dịch vụ, xác minh chứng chỉ, đối soát, thực hiện nghĩa vụ thuế, chống gian lận và giải quyết tranh chấp. Khi không còn mục đích, dữ liệu được xóa, ẩn danh hoặc xử lý theo quy trình phù hợp.",
              "Trong phạm vi pháp luật, người dùng có thể yêu cầu được biết, truy cập, chỉnh sửa, rút lại sự đồng ý, hạn chế, phản đối hoặc xóa dữ liệu. Một số dữ liệu vẫn phải được giữ khi còn nghĩa vụ pháp lý hoặc tranh chấp.",
            ],
          },
          {
            id: "policy-children-data",
            title: "4.8. Dữ liệu người chưa thành niên",
            paragraphs: [
              "ThinkUp hạn chế thu thập dữ liệu người chưa thành niên ở mức cần thiết. Cha mẹ hoặc người giám hộ có thể liên hệ để kiểm tra, chỉnh sửa hoặc yêu cầu xử lý dữ liệu theo pháp luật.",
            ],
          },
          {
            id: "policy-security",
            title: "4.9. Bảo mật hệ thống và sự cố dữ liệu",
            paragraphs: [
              "Mật khẩu được băm hoặc mã hóa một chiều trước khi lưu. ThinkUp áp dụng giới hạn tần suất, chống dò mật khẩu, OTP, phân quyền, nhật ký bảo mật và vô hiệu hóa phiên cũ khi đổi mật khẩu.",
              "Khi phát hiện sự cố dữ liệu, ThinkUp sẽ khoanh vùng, điều tra, khôi phục, lưu hồ sơ và thông báo cho cơ quan có thẩm quyền hoặc người bị ảnh hưởng khi pháp luật yêu cầu.",
            ],
          },
        ],
      },
      {
        id: "policy-final",
        title: "KHIẾU NẠI VÀ ĐIỀU KHOẢN THI HÀNH",
        sections: [
          {
            id: "policy-complaints",
            title: "5.1. Tiếp nhận khiếu nại",
            paragraphs: [
              `Yêu cầu có thể gửi qua email ${LEGAL_CONTACT.email}, hotline ${LEGAL_CONTACT.hotline}, trang Liên hệ hoặc Trung tâm trợ giúp. Người dùng nên cung cấp email tài khoản, mã giao dịch hoặc khóa học liên quan, mô tả và bằng chứng.`,
              "ThinkUp không yêu cầu người dùng cung cấp mật khẩu, OTP, CVV hoặc mật khẩu ngân hàng. Các bên ưu tiên thương lượng trước khi yêu cầu cơ quan hoặc Tòa án có thẩm quyền giải quyết.",
            ],
          },
          {
            id: "policy-governing-law",
            title: "5.2. Luật áp dụng và thay đổi chính sách",
            paragraphs: [
              "Chính sách được điều chỉnh bởi pháp luật Việt Nam và không loại trừ quyền bắt buộc của người tiêu dùng hoặc chủ thể dữ liệu.",
              "ThinkUp có thể cập nhật chính sách do thay đổi dịch vụ, công nghệ hoặc pháp luật. Thay đổi quan trọng được thông báo qua website, email hoặc Trung tâm thông báo. Nếu một phần không hợp lệ, phần còn lại vẫn tiếp tục có hiệu lực.",
            ],
          },
        ],
      },
    ],
  },
};

export const LEGAL_DOCUMENT_IDS = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentId[];

export function getLegalDocument(documentId: LegalDocumentId): LegalDocument {
  return LEGAL_DOCUMENTS[documentId] || null;
}

export function isLegalSection(documentId: LegalDocumentId, sectionId: string | null): boolean {
  if (!sectionId) return false;
  const document = getLegalDocument(documentId);
  return Boolean(document?.groups.some((group) =>
    group.id === sectionId || group.sections.some((section) => section.id === sectionId)
  ));
}
